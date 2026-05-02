from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import DocumentTemplate
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.response import err, ok

router = APIRouter(tags=["templates"])


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    content_md: str = ""
    content_html: str = ""
    category: Optional[str] = Field(None, max_length=64)


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = None
    content_md: Optional[str] = None
    content_html: Optional[str] = None
    category: Optional[str] = Field(None, max_length=64)


def _template_to_dict(t: DocumentTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "content_md": t.content_md,
        "content_html": t.content_html,
        "category": t.category,
        "is_builtin": t.is_builtin,
        "created_by": str(t.created_by) if t.created_by else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DocumentTemplate).where(
            or_(
                DocumentTemplate.is_builtin == True,
                DocumentTemplate.created_by == current_user.id,
            )
        ).order_by(DocumentTemplate.is_builtin.desc(), DocumentTemplate.name.asc())
    )
    templates = result.scalars().all()
    return ok([_template_to_dict(t) for t in templates])


@router.get("/templates/{template_id}")
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DocumentTemplate).where(DocumentTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not template.is_builtin and template.created_by != current_user.id:
        if current_user.role != "super_admin":
            raise HTTPException(status_code=403, detail="Access denied")

    return ok(_template_to_dict(template))


@router.post("/templates", status_code=201)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    template = DocumentTemplate(
        name=payload.name,
        description=payload.description,
        content_md=payload.content_md,
        content_html=payload.content_html,
        category=payload.category,
        is_builtin=False,
        created_by=current_user.id,
    )
    db.add(template)
    await db.flush()
    return ok(_template_to_dict(template))


@router.put("/templates/{template_id}")
async def update_template(
    template_id: uuid.UUID,
    payload: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DocumentTemplate).where(DocumentTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.is_builtin:
        return err("BUILTIN_TEMPLATE", "Built-in templates cannot be modified.", 403)

    if template.created_by != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Cannot modify another user's template")

    if payload.name is not None:
        template.name = payload.name
    if payload.description is not None:
        template.description = payload.description
    if payload.content_md is not None:
        template.content_md = payload.content_md
    if payload.content_html is not None:
        template.content_html = payload.content_html
    if payload.category is not None:
        template.category = payload.category

    await db.flush()
    return ok(_template_to_dict(template))


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DocumentTemplate).where(DocumentTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.is_builtin:
        return err("BUILTIN_TEMPLATE", "Built-in templates cannot be deleted.", 403)

    if template.created_by != current_user.id and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Cannot delete another user's template")

    await db.delete(template)
    return ok({"message": "Template deleted."})
