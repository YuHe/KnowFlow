from __future__ import annotations

import urllib.parse
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document
from app.models.user import User
from app.services.version_service import create_version
from app.utils.auth import get_current_active_user
from app.utils.permissions import (
    ROLE_LEVELS,
    can_edit_doc,
    get_kb_member_role,
    require_kb_role,
)
from app.utils.response import err, ok, paginate

router = APIRouter(tags=["documents"])


# ---- Schemas ----------------------------------------------------------------


class DocCreate(BaseModel):
    title: str = Field("Untitled", max_length=512)
    section_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    content_md: str = ""
    content_html: str = ""
    template_id: Optional[uuid.UUID] = None
    sort_order: int = 0


class DocUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=512)
    section_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    content_md: Optional[str] = None
    content_html: Optional[str] = None
    sort_order: Optional[int] = None
    is_public: Optional[bool] = None
    is_manual_save: bool = False


class DocMoveRequest(BaseModel):
    section_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    sort_order: int = 0
    knowledge_base_id: Optional[uuid.UUID] = None


# ---- Helpers ----------------------------------------------------------------


def _doc_to_dict(doc: Document) -> dict:
    return {
        "id": str(doc.id),
        "knowledge_base_id": str(doc.knowledge_base_id),
        "section_id": str(doc.section_id) if doc.section_id else None,
        "parent_id": str(doc.parent_id) if doc.parent_id else None,
        "title": doc.title,
        "content_md": doc.content_md,
        "content_html": doc.content_html,
        "is_public": doc.is_public,
        "sort_order": doc.sort_order,
        "word_count": doc.word_count,
        "template_id": str(doc.template_id) if doc.template_id else None,
        "created_by": str(doc.created_by) if doc.created_by else None,
        "updated_by": str(doc.updated_by) if doc.updated_by else None,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat(),
    }


def _user_mini(user) -> dict | None:
    if not user:
        return None
    return {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name or user.username,
    }


def _doc_to_list_dict(doc: Document) -> dict:
    d = _doc_to_dict(doc)
    d["created_by_user"] = _user_mini(doc.creator)
    d["updated_by_user"] = _user_mini(doc.updater)
    return d


def _count_words(text: str) -> int:
    return len(text.split()) if text else 0


async def _doc_or_404(doc_id: uuid.UUID, db: AsyncSession) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# ---- Routes -----------------------------------------------------------------


@router.get("/kb/{kb_id}/docs")
async def list_docs(
    kb_id: uuid.UUID,
    section_id: Optional[uuid.UUID] = None,
    order_by: str = "sort_order",
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("viewer")),
):
    from sqlalchemy import func
    from sqlalchemy.orm import selectinload

    stmt = select(Document).where(Document.knowledge_base_id == kb_id)
    if section_id is not None:
        stmt = stmt.where(Document.section_id == section_id)
    if order_by == "updated_at":
        stmt = stmt.order_by(Document.updated_at.desc())
    else:
        stmt = stmt.order_by(Document.sort_order.asc())
    stmt = stmt.options(selectinload(Document.creator), selectinload(Document.updater))

    # Count total
    count_stmt = select(func.count()).select_from(
        select(Document).where(Document.knowledge_base_id == kb_id).subquery()
    )
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginate
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    docs = result.scalars().all()
    return paginate([_doc_to_list_dict(d) for d in docs], total, page, page_size)


@router.post("/kb/{kb_id}/docs", status_code=201)
async def create_doc(
    kb_id: uuid.UUID,
    payload: DocCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    doc = Document(
        knowledge_base_id=kb_id,
        section_id=payload.section_id,
        parent_id=payload.parent_id,
        title=payload.title,
        content_md=payload.content_md,
        content_html=payload.content_html,
        sort_order=payload.sort_order,
        template_id=payload.template_id,
        created_by=current_user.id,
        updated_by=current_user.id,
        word_count=_count_words(payload.content_md),
    )
    db.add(doc)
    await db.flush()
    return ok(_doc_to_dict(doc))


@router.get("/docs/{doc_id}")
async def get_doc(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
        if role is None and not doc.is_public:
            raise HTTPException(status_code=403, detail="Access denied")

    return ok(_doc_to_dict(doc))


@router.put("/docs/{doc_id}")
async def update_doc(
    doc_id: uuid.UUID,
    payload: DocUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
        if not can_edit_doc(current_user.id, doc.created_by, role or ""):
            raise HTTPException(status_code=403, detail="You cannot edit this document")

    if payload.title is not None:
        doc.title = payload.title
    if payload.section_id is not None:
        doc.section_id = payload.section_id
    if payload.parent_id is not None:
        doc.parent_id = payload.parent_id
    if payload.content_md is not None:
        doc.content_md = payload.content_md
        doc.word_count = _count_words(payload.content_md)
    if payload.content_html is not None:
        doc.content_html = payload.content_html
    if payload.sort_order is not None:
        doc.sort_order = payload.sort_order
    if payload.is_public is not None:
        doc.is_public = payload.is_public

    doc.updated_by = current_user.id
    await db.flush()

    # Create a version snapshot on manual save
    if payload.is_manual_save:
        await create_version(
            db=db,
            doc_id=doc.id,
            content_md=doc.content_md,
            content_html=doc.content_html,
            user_id=current_user.id,
            reason="manual",
        )

    return ok(_doc_to_dict(doc))


@router.delete("/docs/{doc_id}")
async def delete_doc(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
        if not can_edit_doc(current_user.id, doc.created_by, role or ""):
            raise HTTPException(status_code=403, detail="You cannot delete this document")

    await db.delete(doc)
    return ok({"message": "Document deleted."})


@router.post("/docs/{doc_id}/move")
async def move_doc(
    doc_id: uuid.UUID,
    payload: DocMoveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
        if not can_edit_doc(current_user.id, doc.created_by, role or ""):
            raise HTTPException(status_code=403, detail="You cannot move this document")

    if payload.knowledge_base_id and payload.knowledge_base_id != doc.knowledge_base_id:
        # Verify user has editor+ in the target KB
        role = await get_kb_member_role(db, payload.knowledge_base_id, current_user.id)
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            raise HTTPException(
                status_code=403, detail="No edit permission in target knowledge base"
            )
        doc.knowledge_base_id = payload.knowledge_base_id

    doc.section_id = payload.section_id
    doc.parent_id = payload.parent_id
    doc.sort_order = payload.sort_order
    doc.updated_by = current_user.id
    await db.flush()
    return ok(_doc_to_dict(doc))


@router.post("/docs/{doc_id}/duplicate", status_code=201)
async def duplicate_doc(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
    if current_user.role != "super_admin":
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            raise HTTPException(
                status_code=403, detail="Editor permission required to duplicate documents"
            )

    new_doc = Document(
        knowledge_base_id=doc.knowledge_base_id,
        section_id=doc.section_id,
        title=f"{doc.title} (copy)",
        content_md=doc.content_md,
        content_html=doc.content_html,
        sort_order=doc.sort_order + 1,
        template_id=doc.template_id,
        created_by=current_user.id,
        updated_by=current_user.id,
        word_count=doc.word_count,
    )
    db.add(new_doc)
    await db.flush()
    return ok(_doc_to_dict(new_doc))


@router.get("/docs/{doc_id}/export")
async def export_doc(
    doc_id: uuid.UUID,
    format: str = "md",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _doc_or_404(doc_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
        if role is None and not doc.is_public:
            raise HTTPException(status_code=403, detail="Access denied")

    safe_title = doc.title.replace("/", "_").replace("\\", "_")
    # RFC 5987 encoded filename for Unicode support (e.g. Chinese titles)
    encoded_title = urllib.parse.quote(safe_title, safe="")

    if format == "md":
        from app.utils.export_md import export_to_markdown

        content = export_to_markdown(doc)
        return Response(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_title}.md"
            },
        )
    elif format == "docx":
        from app.utils.export_docx import export_to_docx

        content = export_to_docx(doc)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_title}.docx"
            },
        )
    elif format == "pdf":
        from app.utils.export_pdf import export_to_pdf

        content = export_to_pdf(doc)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_title}.pdf"
            },
        )
    else:
        return err("INVALID_FORMAT", "Supported formats: md, docx, pdf", 400)
