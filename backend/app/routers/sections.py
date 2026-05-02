from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, Section
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import require_kb_role
from app.utils.response import err, ok

router = APIRouter(tags=["sections"])


# ---- Schemas ----------------------------------------------------------------


class SectionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    parent_id: Optional[uuid.UUID] = None
    sort_order: int = 0


class SectionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=256)
    parent_id: Optional[uuid.UUID] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int
    parent_id: Optional[uuid.UUID] = None


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


# ---- Helpers ----------------------------------------------------------------


def _section_to_dict(section: Section) -> dict:
    return {
        "id": str(section.id),
        "knowledge_base_id": str(section.knowledge_base_id),
        "parent_id": str(section.parent_id) if section.parent_id else None,
        "title": section.title,
        "sort_order": section.sort_order,
        "created_at": section.created_at.isoformat(),
        "updated_at": section.updated_at.isoformat(),
        "children": [],
        "documents": [],
    }




# ---- Routes -----------------------------------------------------------------


@router.get("/kb/{kb_id}/sections")
async def get_sections(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("viewer")),
):
    sections_result = await db.execute(
        select(Section)
        .where(Section.knowledge_base_id == kb_id)
        .order_by(Section.sort_order.asc())
    )
    sections = sections_result.scalars().all()
    return ok([_section_to_dict(s) for s in sections])


@router.post("/kb/{kb_id}/sections", status_code=201)
async def create_section(
    kb_id: uuid.UUID,
    payload: SectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    if payload.parent_id:
        parent_result = await db.execute(
            select(Section).where(
                Section.id == payload.parent_id,
                Section.knowledge_base_id == kb_id,
            )
        )
        if not parent_result.scalar_one_or_none():
            return err("PARENT_NOT_FOUND", "Parent section not found.", 404)

    section = Section(
        knowledge_base_id=kb_id,
        parent_id=payload.parent_id,
        title=payload.title,
        sort_order=payload.sort_order,
        created_by=current_user.id,
    )
    db.add(section)
    await db.flush()
    return ok(_section_to_dict(section))


@router.put("/kb/{kb_id}/sections/{section_id}")
async def update_section(
    kb_id: uuid.UUID,
    section_id: uuid.UUID,
    payload: SectionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    result = await db.execute(
        select(Section).where(
            Section.id == section_id,
            Section.knowledge_base_id == kb_id,
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    if payload.title is not None:
        section.title = payload.title
    if payload.parent_id is not None:
        if payload.parent_id == section_id:
            return err("INVALID_PARENT", "A section cannot be its own parent.", 400)
        section.parent_id = payload.parent_id
    if payload.sort_order is not None:
        section.sort_order = payload.sort_order

    await db.flush()
    return ok(_section_to_dict(section))


@router.delete("/kb/{kb_id}/sections/{section_id}")
async def delete_section(
    kb_id: uuid.UUID,
    section_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    result = await db.execute(
        select(Section).where(
            Section.id == section_id,
            Section.knowledge_base_id == kb_id,
        )
    )
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    # cascade=all,delete-orphan handles children; set documents' section_id to null
    docs_result = await db.execute(
        select(Document).where(Document.section_id == section_id)
    )
    for doc in docs_result.scalars().all():
        doc.section_id = None

    await db.delete(section)
    return ok({"message": "Section deleted."})


@router.post("/kb/{kb_id}/sections/reorder")
async def reorder_sections(
    kb_id: uuid.UUID,
    payload: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("editor")),
):
    for item in payload.items:
        result = await db.execute(
            select(Section).where(
                Section.id == item.id,
                Section.knowledge_base_id == kb_id,
            )
        )
        section = result.scalar_one_or_none()
        if section:
            section.sort_order = item.sort_order
            if item.parent_id is not None:
                section.parent_id = item.parent_id

    await db.flush()
    return ok({"message": "Sections reordered."})
