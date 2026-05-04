from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentShare
from app.models.user import User
from app.utils.auth import get_current_active_user, hash_password
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role
from app.utils.response import err, ok

router = APIRouter(tags=["shares"])


class ShareCreate(BaseModel):
    expires_at: Optional[datetime] = None
    password: Optional[str] = None
    access_level: str = Field("anyone", pattern="^(anyone|members_only)$")


class ShareUpdate(BaseModel):
    expires_at: Optional[datetime] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    access_level: Optional[str] = Field(None, pattern="^(anyone|members_only)$")


def _share_to_dict(s: DocumentShare) -> dict:
    return {
        "id": str(s.id),
        "document_id": str(s.document_id),
        "share_code": s.share_code,
        "access_level": s.access_level,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "has_password": bool(s.password_hash),
        "is_active": s.is_active,
        "created_by": str(s.created_by) if s.created_by else None,
        "created_at": s.created_at.isoformat(),
    }


async def _check_doc_edit_permission(
    doc_id: uuid.UUID, user: User, db: AsyncSession
) -> Document:
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, user.id)
        if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["editor"]:
            raise HTTPException(
                status_code=403, detail="Editor permission required to manage shares"
            )
    return doc


@router.get("/docs/{doc_id}/shares")
async def list_shares(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _check_doc_edit_permission(doc_id, current_user, db)

    result = await db.execute(
        select(DocumentShare)
        .where(DocumentShare.document_id == doc_id)
        .order_by(DocumentShare.created_at.desc())
    )
    shares = result.scalars().all()
    return ok([_share_to_dict(s) for s in shares])


@router.post("/docs/{doc_id}/shares", status_code=201)
async def create_share(
    doc_id: uuid.UUID,
    payload: ShareCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _check_doc_edit_permission(doc_id, current_user, db)

    share_code = secrets.token_urlsafe(6)[:8]  # 8-char URL-safe code

    password_hash = None
    if payload.password:
        password_hash = hash_password(payload.password)

    share = DocumentShare(
        document_id=doc_id,
        share_code=share_code,
        access_level=payload.access_level,
        expires_at=payload.expires_at,
        password_hash=password_hash,
        created_by=current_user.id,
        is_active=True,
    )
    db.add(share)
    await db.flush()
    return ok(_share_to_dict(share))


@router.put("/docs/{doc_id}/shares/{share_id}")
async def update_share(
    doc_id: uuid.UUID,
    share_id: uuid.UUID,
    payload: ShareUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _check_doc_edit_permission(doc_id, current_user, db)

    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == doc_id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    if payload.expires_at is not None:
        share.expires_at = payload.expires_at
    if payload.password is not None:
        share.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        share.is_active = payload.is_active
    if payload.access_level is not None:
        share.access_level = payload.access_level

    await db.flush()
    return ok(_share_to_dict(share))


@router.delete("/docs/{doc_id}/shares/{share_id}")
async def delete_share(
    doc_id: uuid.UUID,
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _check_doc_edit_permission(doc_id, current_user, db)

    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.id == share_id,
            DocumentShare.document_id == doc_id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    return ok({"message": "Share deleted."})
