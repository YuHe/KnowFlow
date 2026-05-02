from __future__ import annotations

import math
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentFavorite
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.response import err, ok, paginate

router = APIRouter(tags=["favorites"])


class FavoriteCreate(BaseModel):
    doc_id: uuid.UUID


def _fav_to_dict(fav: DocumentFavorite, doc: Document | None = None) -> dict:
    d = {
        "id": str(fav.id),
        "user_id": str(fav.user_id),
        "document_id": str(fav.document_id),
        "created_at": fav.created_at.isoformat(),
    }
    if doc:
        d["document"] = {
            "id": str(doc.id),
            "title": doc.title,
            "knowledge_base_id": str(doc.knowledge_base_id),
            "section_id": str(doc.section_id) if doc.section_id else None,
            "updated_at": doc.updated_at.isoformat(),
        }
    return d


@router.get("/favorites")
async def list_favorites(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    offset = (page - 1) * page_size

    count_result = await db.execute(
        select(DocumentFavorite).where(DocumentFavorite.user_id == current_user.id)
    )
    total = len(count_result.scalars().all())

    result = await db.execute(
        select(DocumentFavorite)
        .where(DocumentFavorite.user_id == current_user.id)
        .order_by(DocumentFavorite.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    favs = result.scalars().all()

    out = []
    for fav in favs:
        doc_r = await db.execute(select(Document).where(Document.id == fav.document_id))
        doc = doc_r.scalar_one_or_none()
        out.append(_fav_to_dict(fav, doc))

    return paginate(out, total, page, page_size)


@router.post("/favorites", status_code=201)
async def add_favorite(
    payload: FavoriteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc_r = await db.execute(select(Document).where(Document.id == payload.doc_id))
    doc = doc_r.scalar_one_or_none()
    if not doc:
        return err("DOC_NOT_FOUND", "Document not found.", 404)

    # Check for existing favorite
    existing = await db.execute(
        select(DocumentFavorite).where(
            DocumentFavorite.user_id == current_user.id,
            DocumentFavorite.document_id == payload.doc_id,
        )
    )
    if existing.scalar_one_or_none():
        return err("ALREADY_FAVORITED", "Document already in favorites.", 409)

    fav = DocumentFavorite(
        user_id=current_user.id,
        document_id=payload.doc_id,
    )
    db.add(fav)
    try:
        await db.flush()
    except IntegrityError:
        return err("ALREADY_FAVORITED", "Document already in favorites.", 409)

    return ok(_fav_to_dict(fav, doc))


@router.delete("/favorites/{doc_id}")
async def remove_favorite(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(
        select(DocumentFavorite).where(
            DocumentFavorite.user_id == current_user.id,
            DocumentFavorite.document_id == doc_id,
        )
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")

    await db.delete(fav)
    return ok({"message": "Removed from favorites."})
