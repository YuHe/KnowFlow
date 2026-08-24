from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document import Asset, Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role
from app.utils.rate_limit import check_rate_limit
from app.utils.response import err, ok
from app.utils.storage import get_storage
from app.utils.url_guard import is_safe_remote_url

router = APIRouter(tags=["assets"])

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/markdown",
    "application/zip",
}


def _asset_to_dict(a: Asset) -> dict:
    return {
        "id": str(a.id),
        "knowledge_base_id": str(a.knowledge_base_id),
        "document_id": str(a.document_id) if a.document_id else None,
        "filename": a.filename,
        "url": a.url,
        "mime_type": a.mime_type,
        "size_bytes": a.size_bytes,
        "created_at": a.created_at.isoformat(),
    }


@router.post("/assets/upload", status_code=201)
async def upload_asset(
    file: UploadFile = File(...),
    kb_id: uuid.UUID = Form(...),
    doc_id: Optional[uuid.UUID] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Verify KB exists
    kb_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        return err("KB_NOT_FOUND", "Knowledge base not found.", 404)

    # Verify membership
    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, kb_id, current_user.id)
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            return err("FORBIDDEN", "Editor permission required to upload files.", 403)

    # Validate MIME type
    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_MIME_TYPES:
        return err(
            "INVALID_MIME_TYPE",
            f"File type '{mime}' is not allowed.",
            415,
        )

    # Read to check size (UploadFile does not expose size ahead of time)
    content = await file.read()
    await file.seek(0)  # reset for storage.save

    size_bytes = len(content)
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if size_bytes > max_bytes:
        return err(
            "FILE_TOO_LARGE",
            f"File exceeds max size of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            413,
        )

    # Image-specific size limit
    if mime.startswith("image/"):
        img_max = settings.IMAGE_MAX_SIZE_MB * 1024 * 1024
        if size_bytes > img_max:
            return err(
                "IMAGE_TOO_LARGE",
                f"Image exceeds max size of {settings.IMAGE_MAX_SIZE_MB} MB.",
                413,
            )

    storage = get_storage()
    storage_path, url = await storage.save(file, str(kb_id), file.filename or "upload")

    asset = Asset(
        knowledge_base_id=kb_id,
        document_id=doc_id,
        uploader_id=current_user.id,
        filename=file.filename or "upload",
        storage_path=storage_path,
        url=url,
        mime_type=mime,
        size_bytes=size_bytes,
    )
    db.add(asset)
    await db.flush()
    return ok(_asset_to_dict(asset))


class FetchRemoteRequest(BaseModel):
    url: str
    kb_id: uuid.UUID
    doc_id: Optional[uuid.UUID] = None


# Hard cap on how much of a remote response we accept before rejecting it as
# too large. Matches the per-image upload limit for parity.
_REMOTE_IMAGE_MAX_BYTES = settings.IMAGE_MAX_SIZE_MB * 1024 * 1024

# Read granularity while streaming. Small enough that the size cap trips
# promptly on an oversized body, large enough to avoid excessive await churn.
_REMOTE_CHUNK_BYTES = 64 * 1024

# Total wall-clock budget for one download. httpx's timeout is per-read, so a
# server that drips bytes slowly resets it indefinitely; this is the ceiling
# that actually bounds the request. Kept well under the frontend's per-request
# timeout so the client sees a real error rather than a client-side abort.
_REMOTE_TOTAL_DEADLINE_S = 20.0

# Per-user throttle. This endpoint makes the server fetch arbitrary URLs on
# the caller's behalf, so without a cap an authenticated user can drive it as
# a download proxy or an amplifier. Sized so a single image-heavy article
# never trips it (the frontend caps itself at 4 concurrent downloads, and even
# very long articles rarely exceed ~100 images); a caller that does exceed it
# gets 429s for the remainder, which the editor reports as failed images
# rather than hanging. Per-user rather than per-IP so a shared office NAT
# isn't collectively throttled.
_REMOTE_FETCH_LIMIT = 200
_REMOTE_FETCH_WINDOW_S = 60

# Only image/* content-types are fetchable. SVG is allowed but treated as
# text — callers should be aware SVGs can carry scripts (sanitize on render).
_REMOTE_ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/x-icon",
    "image/avif",
}


class _RemoteImageTooLarge(Exception):
    """Raised when a streamed remote body exceeds _REMOTE_IMAGE_MAX_BYTES."""


async def _download_remote_image(
    url: str, headers: dict[str, str]
) -> tuple[bytes, httpx.Headers, str]:
    """Stream a remote image, enforcing the size cap as bytes arrive.

    Returns (content, response_headers, final_url). Streamed rather than read
    via resp.content because the latter buffers the entire body into memory
    before any size check can run, which makes the cap unenforceable.
    """
    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=3,
        timeout=httpx.Timeout(15.0, connect=10.0),
    ) as client:
        async with client.stream("GET", url, headers=headers) as resp:
            resp.raise_for_status()

            # Content-Length lets us reject before transferring the body. It
            # may be absent or wrong, so the streaming check below remains
            # authoritative.
            declared = resp.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > _REMOTE_IMAGE_MAX_BYTES:
                raise _RemoteImageTooLarge

            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes(_REMOTE_CHUNK_BYTES):
                total += len(chunk)
                if total > _REMOTE_IMAGE_MAX_BYTES:
                    raise _RemoteImageTooLarge
                chunks.append(chunk)

            return b"".join(chunks), resp.headers, str(resp.url)


@router.post("/assets/fetch-remote", status_code=201)
async def fetch_remote_image(
    payload: FetchRemoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Download a remote image and store it locally, returning its URL.

    Used by the editor to localize external image links when pasting markdown:
    the browser can't fetch cross-origin image bytes (CORS), so the download
    happens here. SSRF-guarded — internal/loopback/metadata IPs are rejected.
    """
    kb_id = payload.kb_id

    # 1. Permission: editor in the target KB (same gate as upload).
    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, kb_id, current_user.id)
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            return err("FORBIDDEN", "Editor permission required to fetch files.", 403)

    # 2. Throttle: this endpoint fetches arbitrary URLs server-side, so cap how
    # fast one user can drive it. Checked after the permission gate so a
    # non-member can't consume an authorized user's budget.
    limit = await check_rate_limit(
        f"fetch-remote:{current_user.id}",
        _REMOTE_FETCH_LIMIT,
        _REMOTE_FETCH_WINDOW_S,
    )
    if not limit.allowed:
        return err(
            "RATE_LIMITED",
            f"Too many image downloads. Retry in {limit.retry_after}s.",
            429,
        )

    # Release the pooled DB connection before the (slow) network download.
    # The permission query above checked one out, and it would otherwise stay
    # checked out for the whole fetch. A single paste of N images issues N
    # concurrent requests, which is enough to exhaust the pool and stall
    # unrelated requests. The session re-acquires a connection lazily below.
    await db.commit()

    # 3. SSRF validation — returns (ok, reason, safe_ip).
    ok_flag, reason, safe_ip = await is_safe_remote_url(payload.url)
    if not ok_flag:
        return err("UNSAFE_URL", f"Remote URL rejected: {reason}", 422)

    # We validated the resolved IP above, then connect to the original URL
    # (not the IP). Pinning the connection to the IP would break TLS: the
    # server certificate is issued for the hostname, not the IP, so SNI/cert
    # verification fails. The residual DNS-rebinding window is acceptable
    # here because (a) this endpoint only fetches user-pasted images — not
    # an automated crawl of untrusted URLs — and (b) we cap size, redirects,
    # and timeout and re-check the final URL scheme after redirects.
    headers = {
        "User-Agent": "KnowFlow/1.0 (image-localizer)",
        "Accept": "image/*",
    }

    # 4. Download with bounded size, limited redirects, and a total deadline.
    try:
        content, response_headers, final_url = await asyncio.wait_for(
            _download_remote_image(payload.url, headers),
            timeout=_REMOTE_TOTAL_DEADLINE_S,
        )
    except _RemoteImageTooLarge:
        return err(
            "IMAGE_TOO_LARGE",
            f"Image exceeds max size of {settings.IMAGE_MAX_SIZE_MB} MB.",
            413,
        )
    except httpx.HTTPStatusError as exc:
        return err(
            "REMOTE_FETCH_FAILED",
            f"Remote returned HTTP {exc.response.status_code}.",
            502,
        )
    except asyncio.TimeoutError:
        return err(
            "REMOTE_FETCH_FAILED",
            f"Download exceeded the {_REMOTE_TOTAL_DEADLINE_S:.0f}s time limit.",
            504,
        )
    except (httpx.RequestError, httpx.HTTPError) as exc:
        return err("REMOTE_FETCH_FAILED", f"Could not download image: {exc}", 502)

    size_bytes = len(content)
    if size_bytes == 0:
        return err("REMOTE_FETCH_FAILED", "Remote returned an empty body.", 502)

    # 5. Re-check the FINAL URL after redirects — a redirect can land on an
    # internal host even though the original URL resolved to a public IP.
    if final_url != payload.url:
        ok_final, reason_final, _ = await is_safe_remote_url(final_url)
        if not ok_final:
            return err("UNSAFE_URL", f"Redirect target rejected: {reason_final}", 422)

    # 6. Content-type check. Prefer the Content-Type header; if it's generic
    # (application/octet-stream) we still accept — the URL extension or a
    # sniff isn't worth the complexity here, render-time <img> will just fail
    # visibly if it's not actually an image.
    mime = (response_headers.get("content-type") or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in _REMOTE_ALLOWED_IMAGE_MIME and mime != "application/octet-stream":
        return err(
            "INVALID_MIME_TYPE",
            f"Remote resource is not an image (got '{mime}').",
            415,
        )
    # Default the stored mime so the Asset row + extension are sensible.
    effective_mime = mime if mime in _REMOTE_ALLOWED_IMAGE_MIME else "image/png"

    # 7. Derive a filename from the URL path (for extension hint), then save.
    url_path = urlparse(payload.url).path or "/"
    filename = Path(url_path).name or "remote-image"

    storage = get_storage()
    storage_path, url = await storage.save_bytes(
        content, str(kb_id), filename, effective_mime
    )

    asset = Asset(
        knowledge_base_id=kb_id,
        document_id=payload.doc_id,
        uploader_id=current_user.id,
        filename=filename,
        storage_path=storage_path,
        url=url,
        mime_type=effective_mime,
        size_bytes=size_bytes,
    )
    db.add(asset)
    await db.flush()
    return ok({"url": url, "filename": filename, "id": str(asset.id)})


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, asset.knowledge_base_id, current_user.id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")

    return ok(_asset_to_dict(asset))


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, asset.knowledge_base_id, current_user.id)
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    storage = get_storage()
    await storage.delete(asset.storage_path)
    await db.delete(asset)
    return ok({"message": "Asset deleted."})
