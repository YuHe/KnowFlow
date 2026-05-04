from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentShare, Section
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.utils.auth import get_current_user_optional, verify_password
from app.utils.response import err, ok

router = APIRouter(tags=["public"])


class ShareAccessRequest(BaseModel):
    password: Optional[str] = None


def _section_tree(
    sections: list[Section],
    docs_by_section: dict,
    parent_id: Optional[uuid.UUID] = None,
) -> list[dict]:
    nodes = []
    for s in sorted(
        [sec for sec in sections if sec.parent_id == parent_id],
        key=lambda x: x.sort_order,
    ):
        node = {
            "id": str(s.id),
            "title": s.title,
            "sort_order": s.sort_order,
            "documents": docs_by_section.get(s.id, []),
            "children": _section_tree(sections, docs_by_section, s.id),
        }
        nodes.append(node)
    return nodes


@router.get("/public/kb/{kb_slug}")
async def public_kb_index(
    kb_slug: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.slug == kb_slug,
            KnowledgeBase.visibility == "public",
        )
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or not public")

    # Owner info
    owner_r = await db.execute(select(User).where(User.id == kb.owner_id))
    owner = owner_r.scalar_one_or_none()

    # Build directory tree
    sections_r = await db.execute(
        select(Section)
        .where(Section.knowledge_base_id == kb.id)
        .order_by(Section.sort_order.asc())
    )
    sections = sections_r.scalars().all()

    docs_r = await db.execute(
        select(Document).where(Document.knowledge_base_id == kb.id)
    )
    docs = docs_r.scalars().all()

    docs_by_section: dict = {}
    for doc in docs:
        key = doc.section_id
        if key not in docs_by_section:
            docs_by_section[key] = []
        docs_by_section[key].append(
            {
                "id": str(doc.id),
                "title": doc.title,
                "sort_order": doc.sort_order,
                "updated_at": doc.updated_at.isoformat(),
            }
        )

    tree = _section_tree(sections, docs_by_section)

    return ok(
        {
            "id": str(kb.id),
            "name": kb.name,
            "slug": kb.slug,
            "description": kb.description,
            "icon": kb.icon,
            "owner": (
                {
                    "id": str(owner.id),
                    "username": owner.username,
                    "display_name": owner.display_name,
                    "avatar_url": owner.avatar_url,
                }
                if owner
                else None
            ),
            "created_at": kb.created_at.isoformat(),
            "tree": tree,
            "orphan_docs": docs_by_section.get(None, []),
        }
    )


@router.get("/public/kb/{kb_slug}/docs/{doc_id}")
async def public_doc(
    kb_slug: str,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(
        select(KnowledgeBase).where(
            KnowledgeBase.slug == kb_slug,
            KnowledgeBase.visibility == "public",
        )
    )
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found or not public")

    doc_result = await db.execute(
        select(Document).where(
            Document.id == doc_id,
            Document.knowledge_base_id == kb.id,
        )
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return ok(
        {
            "id": str(doc.id),
            "title": doc.title,
            "content_md": doc.content_md,
            "content_html": doc.content_html,
            "word_count": doc.word_count,
            "section_id": str(doc.section_id) if doc.section_id else None,
            "created_at": doc.created_at.isoformat(),
            "updated_at": doc.updated_at.isoformat(),
        }
    )


@router.get("/s/{share_code}")
async def access_share(
    share_code: str,
    password: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    share_result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.share_code == share_code,
        )
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    if not share.is_active:
        return err("SHARE_DISABLED", "This share link has been disabled.", 403)

    # Check expiry
    if share.expires_at:
        if share.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return err("SHARE_EXPIRED", "This share link has expired.", 410)

    # Check access_level
    if share.access_level == "members_only":
        if not current_user:
            return err("AUTH_REQUIRED", "Authentication required to access this share.", 401)
        # Check if user is a member of the KB
        doc_r = await db.execute(select(Document).where(Document.id == share.document_id))
        doc_for_check = doc_r.scalar_one_or_none()
        if doc_for_check:
            from app.utils.permissions import get_kb_member_role
            role = await get_kb_member_role(db, doc_for_check.knowledge_base_id, current_user.id)
            if not role:
                return err("FORBIDDEN", "You are not a member of this knowledge base.", 403)

    # Check password
    if share.password_hash:
        if not password:
            return err("PASSWORD_REQUIRED", "This share requires a password.", 401)
        if not verify_password(password, share.password_hash):
            return err("WRONG_PASSWORD", "Incorrect share password.", 401)

    # Load document with creator and updater
    doc_result = await db.execute(
        select(Document)
        .options(selectinload(Document.creator), selectinload(Document.updater))
        .where(Document.id == share.document_id)
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    def _user_dict(u: User | None) -> dict | None:
        if not u:
            return None
        return {"display_name": u.display_name, "username": u.username}

    return ok(
        {
            "id": str(doc.id),
            "title": doc.title,
            "content_md": doc.content_md,
            "content_html": doc.content_html,
            "word_count": doc.word_count,
            "created_by_user": _user_dict(doc.creator),
            "updated_by_user": _user_dict(doc.updater),
            "updated_at": doc.updated_at.isoformat(),
            "share_expiry": share.expires_at.isoformat() if share.expires_at else None,
        }
    )
