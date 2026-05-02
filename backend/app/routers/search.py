from __future__ import annotations

import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.response import ok, paginate

router = APIRouter(tags=["search"])


@router.get("/search")
async def full_text_search(
    q: str,
    kb_id: Optional[uuid.UUID] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not q or not q.strip():
        return paginate([], 0, page, page_size)

    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    offset = (page - 1) * page_size

    # Build base FTS condition using PostgreSQL to_tsvector / plainto_tsquery
    fts_condition = text(
        "to_tsvector('simple', COALESCE(documents.title, '') || ' ' || COALESCE(documents.content_md, '')) "
        "@@ plainto_tsquery('simple', :q)"
    ).bindparams(q=q.strip())

    # Restrict to KBs the user is a member of (or public KBs, or super_admin)
    if current_user.role == "super_admin":
        accessible_kb_ids_subquery = select(KnowledgeBase.id)
    else:
        accessible_kb_ids_subquery = (
            select(KnowledgeBase.id)
            .join(
                KnowledgeBaseMember,
                KnowledgeBaseMember.knowledge_base_id == KnowledgeBase.id,
            )
            .where(KnowledgeBaseMember.user_id == current_user.id)
        )

    stmt = (
        select(
            Document.id,
            Document.knowledge_base_id,
            Document.title,
            Document.updated_at,
            Document.updated_by,
            func.ts_headline(
                "simple",
                func.coalesce(Document.content_md, ""),
                func.plainto_tsquery("simple", q.strip()),
                "MaxFragments=2, MaxWords=20, MinWords=5",
            ).label("snippet"),
        )
        .where(
            and_(
                fts_condition,
                Document.knowledge_base_id.in_(accessible_kb_ids_subquery),
            )
        )
    )

    if kb_id:
        stmt = stmt.where(Document.knowledge_base_id == kb_id)

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Paginate results
    stmt = stmt.order_by(Document.updated_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    rows = result.all()

    # Batch-load KB names and updater info
    kb_ids = list({row.knowledge_base_id for row in rows})
    user_ids = list({row.updated_by for row in rows if row.updated_by})

    kb_map: dict = {}
    if kb_ids:
        kb_rows = (await db.execute(select(KnowledgeBase).where(KnowledgeBase.id.in_(kb_ids)))).scalars().all()
        kb_map = {kb.id: kb.name for kb in kb_rows}

    user_map: dict = {}
    if user_ids:
        user_rows = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
        user_map = {u.id: u for u in user_rows}

    items = [
        {
            "doc_id": str(row.id),
            "kb_id": str(row.knowledge_base_id),
            "kb_name": kb_map.get(row.knowledge_base_id, ""),
            "title": row.title,
            "snippet": row.snippet or "",
            "updated_at": row.updated_at.isoformat(),
            "updated_by": (
                {
                    "id": str(user_map[row.updated_by].id),
                    "username": user_map[row.updated_by].username,
                    "display_name": user_map[row.updated_by].display_name,
                }
                if row.updated_by and row.updated_by in user_map
                else None
            ),
        }
        for row in rows
    ]

    return paginate(items, total, page, page_size)

