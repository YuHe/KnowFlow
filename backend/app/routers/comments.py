from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentComment
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role
from app.utils.response import err, ok

router = APIRouter(tags=["comments"])


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    parent_id: uuid.UUID | None = None


def _comment_to_dict(c: DocumentComment, user: User | None = None) -> dict:
    d = {
        "id": str(c.id),
        "document_id": str(c.document_id),
        "user_id": str(c.user_id),
        "content": c.content,
        "parent_id": str(c.parent_id) if c.parent_id else None,
        "created_at": c.created_at.isoformat(),
        "user": None,
        "replies": [],
    }
    if user:
        d["user"] = {
            "id": str(user.id),
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
        }
    return d


async def _get_doc_and_check_membership(
    doc_id: uuid.UUID, user: User, db: AsyncSession, min_role: str = "viewer"
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, user.id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
        if ROLE_LEVELS.get(role, 0) < ROLE_LEVELS[min_role]:
            raise HTTPException(
                status_code=403, detail=f"Requires at least '{min_role}' role"
            )
    return doc


@router.get("/docs/{doc_id}/comments")
async def list_comments(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_doc_and_check_membership(doc_id, current_user, db, "viewer")

    result = await db.execute(
        select(DocumentComment)
        .where(
            DocumentComment.document_id == doc_id,
            DocumentComment.parent_id == None,  # top-level only
        )
        .order_by(DocumentComment.created_at.asc())
    )
    top_level = result.scalars().all()

    # Fetch all replies in one query
    replies_result = await db.execute(
        select(DocumentComment)
        .where(
            DocumentComment.document_id == doc_id,
            DocumentComment.parent_id != None,
        )
        .order_by(DocumentComment.created_at.asc())
    )
    all_replies = replies_result.scalars().all()

    # Build reply lookup
    replies_by_parent: dict[uuid.UUID, list[DocumentComment]] = {}
    for r in all_replies:
        if r.parent_id not in replies_by_parent:
            replies_by_parent[r.parent_id] = []
        replies_by_parent[r.parent_id].append(r)

    # Collect all user ids
    user_ids = {c.user_id for c in top_level} | {r.user_id for r in all_replies}
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in users_result.scalars().all()}

    out = []
    for c in top_level:
        d = _comment_to_dict(c, users.get(c.user_id))
        d["replies"] = [
            _comment_to_dict(r, users.get(r.user_id))
            for r in replies_by_parent.get(c.id, [])
        ]
        out.append(d)

    return ok(out)


@router.post("/docs/{doc_id}/comments", status_code=201)
async def add_comment(
    doc_id: uuid.UUID,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_doc_and_check_membership(doc_id, current_user, db, "viewer")

    if payload.parent_id:
        parent_r = await db.execute(
            select(DocumentComment).where(
                DocumentComment.id == payload.parent_id,
                DocumentComment.document_id == doc_id,
            )
        )
        if not parent_r.scalar_one_or_none():
            return err("PARENT_NOT_FOUND", "Parent comment not found.", 404)

    comment = DocumentComment(
        document_id=doc_id,
        user_id=current_user.id,
        content=payload.content,
        parent_id=payload.parent_id,
    )
    db.add(comment)
    await db.flush()
    return ok(_comment_to_dict(comment, current_user))


@router.delete("/docs/{doc_id}/comments/{comment_id}")
async def delete_comment(
    doc_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _get_doc_and_check_membership(doc_id, current_user, db, "viewer")

    result = await db.execute(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == doc_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Allow: own comment, or admin/owner of the KB, or super_admin
    if comment.user_id != current_user.id:
        if current_user.role != "super_admin":
            role = await get_kb_member_role(db, doc.knowledge_base_id, current_user.id)
            if not role or ROLE_LEVELS.get(role, 0) < ROLE_LEVELS["admin"]:
                raise HTTPException(
                    status_code=403, detail="Cannot delete other users' comments"
                )

    await db.delete(comment)
    return ok({"message": "Comment deleted."})
