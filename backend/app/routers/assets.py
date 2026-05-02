from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.document import Asset, Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role
from app.utils.response import err, ok
from app.utils.storage import get_storage

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
