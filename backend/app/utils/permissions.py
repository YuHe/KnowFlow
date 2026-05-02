from __future__ import annotations

import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.auth import get_current_active_user

# Role hierarchy: owner(4) > admin(3) > editor(2) > viewer(1)
ROLE_LEVELS: dict[str, int] = {
    "viewer": 1,
    "editor": 2,
    "admin": 3,
    "owner": 4,
}


async def get_kb_member_role(
    db: AsyncSession,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[str]:
    """Return the role string if the user is a member of the KB, else None."""
    from app.models.knowledge_base import KnowledgeBaseMember

    result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    return member.role if member else None


async def check_kb_access(
    db: AsyncSession,
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    min_role: str,
) -> bool:
    """
    Return True if the user's role in the KB is >= min_role in the hierarchy.
    Roles: owner(4) > admin(3) > editor(2) > viewer(1).
    """
    role = await get_kb_member_role(db, kb_id, user_id)
    if role is None:
        return False
    return ROLE_LEVELS.get(role, 0) >= ROLE_LEVELS.get(min_role, 0)


def require_kb_role(min_role: str):
    """
    FastAPI dependency factory.
    Returns a dependency that resolves the caller's role in the KB and
    raises 403 if the role is below min_role.

    Usage::

        router.get("/{kb_id}/something")
        async def endpoint(
            kb_id: UUID,
            role: str = Depends(require_kb_role("editor")),
            ...
        ):
            ...
    """

    async def _dependency(
        kb_id: uuid.UUID,
        current_user=Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> str:
        from app.models.knowledge_base import KnowledgeBase

        # Super admins bypass KB-level permissions
        if current_user.role == "super_admin":
            return "owner"

        # Make sure the KB exists
        kb_result = await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.id == kb_id)
        )
        kb = kb_result.scalar_one_or_none()
        if kb is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge base not found",
            )

        role = await get_kb_member_role(db, kb_id, current_user.id)
        if role is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this knowledge base",
            )

        if ROLE_LEVELS.get(role, 0) < ROLE_LEVELS.get(min_role, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires at least '{min_role}' role",
            )
        return role

    return _dependency


def can_edit_doc(
    user_id: uuid.UUID,
    doc_created_by: Optional[uuid.UUID],
    role: str,
) -> bool:
    """
    Return True if the user can edit a document.

    Rules:
      - owner / admin : can edit ANY document in the KB.
      - editor        : can ONLY edit documents they created themselves.
      - viewer        : cannot edit.
    """
    level = ROLE_LEVELS.get(role, 0)
    if level >= ROLE_LEVELS["admin"]:
        return True
    if level == ROLE_LEVELS["editor"] and doc_created_by == user_id:
        return True
    return False
