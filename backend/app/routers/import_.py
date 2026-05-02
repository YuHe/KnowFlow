from __future__ import annotations

import io
import re
import uuid
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, Section
from app.models.knowledge_base import KnowledgeBase
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import require_kb_role
from app.utils.response import err, ok

router = APIRouter(tags=["import"])


def _extract_title_from_md(content: str, filename: str) -> str:
    """Extract H1 title from markdown, or fall back to filename."""
    match = re.match(r"^#\s+(.+)", content.strip(), re.MULTILINE)
    if match:
        return match.group(1).strip()
    return Path(filename).stem


@router.post("/kb/{kb_id}/import/markdown", status_code=201)
async def import_markdown(
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    section_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    if not file.filename or not file.filename.lower().endswith(".md"):
        return err("INVALID_FILE", "Only .md files are accepted.", 400)

    content_bytes = await file.read()
    try:
        content_md = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return err("DECODE_ERROR", "File is not valid UTF-8 text.", 400)

    title = _extract_title_from_md(content_md, file.filename)

    # Optionally convert markdown to HTML
    try:
        import markdown as md_lib

        content_html = md_lib.markdown(
            content_md,
            extensions=["extra", "codehilite", "toc"],
        )
    except Exception:
        content_html = ""

    doc = Document(
        knowledge_base_id=kb_id,
        section_id=section_id,
        title=title,
        content_md=content_md,
        content_html=content_html,
        created_by=current_user.id,
        updated_by=current_user.id,
        word_count=len(content_md.split()),
    )
    db.add(doc)
    await db.flush()

    return ok(
        {
            "id": str(doc.id),
            "title": doc.title,
            "knowledge_base_id": str(doc.knowledge_base_id),
            "section_id": str(doc.section_id) if doc.section_id else None,
        }
    )


@router.post("/kb/{kb_id}/import/batch", status_code=201)
async def import_batch_zip(
    kb_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        return err("INVALID_FILE", "Only .zip files are accepted.", 400)

    content_bytes = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content_bytes))
    except zipfile.BadZipFile:
        return err("INVALID_ZIP", "The uploaded file is not a valid ZIP archive.", 400)

    # Map directory path -> Section model
    section_map: dict[str, Section] = {}
    created_docs = []

    # Sort entries so directories come before files
    entries = sorted(zf.namelist())

    try:
        import markdown as md_lib
    except ImportError:
        md_lib = None

    for entry in entries:
        parts = Path(entry).parts
        if not parts:
            continue

        # Skip macOS artefacts
        if any(p.startswith("__MACOSX") or p.startswith(".") for p in parts):
            continue

        if entry.endswith("/"):
            # Directory — create a section hierarchy
            dir_path = entry.rstrip("/")
            dir_parts = Path(dir_path).parts
            parent_section: Optional[Section] = None

            for depth, dir_name in enumerate(dir_parts):
                key = "/".join(dir_parts[: depth + 1])
                if key not in section_map:
                    section = Section(
                        knowledge_base_id=kb_id,
                        parent_id=parent_section.id if parent_section else None,
                        title=dir_name,
                        sort_order=depth,
                        created_by=current_user.id,
                    )
                    db.add(section)
                    await db.flush()
                    section_map[key] = section
                parent_section = section_map[key]

        elif entry.lower().endswith(".md"):
            try:
                raw = zf.read(entry).decode("utf-8", errors="replace")
            except Exception:
                continue

            title = _extract_title_from_md(raw, Path(entry).name)
            content_html = ""
            if md_lib:
                try:
                    content_html = md_lib.markdown(
                        raw, extensions=["extra", "codehilite", "toc"]
                    )
                except Exception:
                    pass

            # Resolve parent section
            parent_dir = str(Path(entry).parent)
            if parent_dir == ".":
                parent_dir = ""
            section_id = None
            if parent_dir and parent_dir in section_map:
                section_id = section_map[parent_dir].id

            doc = Document(
                knowledge_base_id=kb_id,
                section_id=section_id,
                title=title,
                content_md=raw,
                content_html=content_html,
                created_by=current_user.id,
                updated_by=current_user.id,
                word_count=len(raw.split()),
            )
            db.add(doc)
            await db.flush()
            created_docs.append(
                {
                    "id": str(doc.id),
                    "title": doc.title,
                    "path": entry,
                    "section_id": str(doc.section_id) if doc.section_id else None,
                }
            )

    return ok(
        {
            "sections_created": len(section_map),
            "documents_created": len(created_docs),
            "documents": created_docs,
        }
    )
