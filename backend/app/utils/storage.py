from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import UploadFile

from app.config import settings


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
        url = f"{settings.PUBLIC_BASE_URL}/uploads/{storage_path}"
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
