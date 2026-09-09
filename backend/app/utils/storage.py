from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

import aiofiles
from fastapi import UploadFile

from app.config import settings

# Maps MIME types to file extensions so remote images whose URL has no
# extension (or a non-image one) still land on disk with a sensible suffix.
_MIME_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/x-icon": ".ico",
    "image/avif": ".avif",
}


def _ext_from_mime(mime: str) -> str:
    """Return a file extension for a MIME type, defaulting to .bin."""
    return _MIME_EXT.get(mime.split(";")[0].strip().lower(), ".bin")


class LocalStorage:
    def __init__(self, base_path: str) -> None:
        self.base_path = Path(base_path)

    async def save(
        self,
        file: UploadFile,
        kb_id: str,
        filename: str,
    ) -> tuple[str, str]:
        """
        Save an uploaded file and return (storage_path, public_url).

        storage_path is relative to STORAGE_LOCAL_PATH.
        public_url is the HTTP URL used to access the file.
        """
        kb_dir = self.base_path / str(kb_id)
        kb_dir.mkdir(parents=True, exist_ok=True)

        # Generate a unique filename to prevent collisions
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = kb_dir / unique_name

        content = await file.read()
        async with aiofiles.open(dest, "wb") as f:
            await f.write(content)

        storage_path = f"{kb_id}/{unique_name}"
        # Store a site-relative URL so it works under any domain (nginx
        # reverse-proxies /uploads/ to the backend). Avoids hardcoding a host.
        url = f"/uploads/{storage_path}"
        return storage_path, url

    async def save_bytes(
        self,
        data: bytes,
        kb_id: str,
        filename: str,
        mime_type: str,
    ) -> tuple[str, str]:
        """
        Save raw bytes (e.g. a downloaded remote image) and return
        (storage_path, public_url). Unlike save(), this takes bytes directly
        because remote downloads bypass the UploadFile/SpooledTemporaryFile
        machinery.
        """
        kb_dir = self.base_path / str(kb_id)
        kb_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(filename).suffix or _ext_from_mime(mime_type)
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = kb_dir / unique_name

        async with aiofiles.open(dest, "wb") as f:
            await f.write(data)

        storage_path = f"{kb_id}/{unique_name}"
        url = f"/uploads/{storage_path}"
        return storage_path, url

    async def delete(self, storage_path: str) -> None:
        """Delete a file by its storage_path."""
        full_path = self.base_path / storage_path
        try:
            os.remove(full_path)
        except FileNotFoundError:
            pass


_storage: Optional[LocalStorage] = None


def get_storage() -> LocalStorage:
    """Return the configured storage adapter (currently only local)."""
    global _storage
    if _storage is None:
        _storage = LocalStorage(settings.STORAGE_LOCAL_PATH)
    return _storage


# URL prefix that save()/save_bytes() hand out. nginx reverse-proxies it to the
# backend, so stored HTML only ever carries this site-relative form.
PUBLIC_URL_PREFIX = "/uploads/"


def resolve_public_url_to_path(url: str) -> Optional[Path]:
    """
    Map a stored `/uploads/...` URL back to the file on disk.

    Exporters need this because the URL is site-relative: WeasyPrint resolves a
    root-relative path against the *origin*, not against a base directory, so no
    base_url can make `/uploads/x.png` find `STORAGE_LOCAL_PATH/x.png`. python-docx
    likewise needs a real path to embed a picture.

    Returns None — rather than raising — for anything that is not a local asset
    (absolute http(s) URLs, data URIs), for paths that escape the storage root,
    and for files that do not exist. Callers should leave such references alone.
    """
    if not url or not url.startswith(PUBLIC_URL_PREFIX):
        return None

    relative = unquote(url[len(PUBLIC_URL_PREFIX):]).split("?", 1)[0].split("#", 1)[0]
    if not relative:
        return None

    root = Path(settings.STORAGE_LOCAL_PATH).resolve()
    # Containment check against `..` in the stored URL. Document HTML is
    # user-authored, so a crafted src must not turn an export into an arbitrary
    # file read.
    try:
        candidate = (root / relative).resolve()
        candidate.relative_to(root)
    except (ValueError, OSError):
        return None

    return candidate if candidate.is_file() else None
