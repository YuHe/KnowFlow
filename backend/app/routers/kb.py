from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from slugify import slugify
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.kb import KbCreate, KbOut, KbUpdate, MemberAdd, MemberOut, MemberUpdate
from app.utils.auth import get_current_active_user
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role, require_kb_role
from app.utils.response import err, ok

router = APIRouter(tags=["knowledge-bases"])


async def _kb_or_404(kb_id: uuid.UUID, db: AsyncSession) -> KnowledgeBase:
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


async def _unique_slug(base: str, db: AsyncSession) -> str:
    slug = slugify(base)
    candidate = slug
    counter = 1
    while True:
        existing = await db.execute(
            select(KnowledgeBase).where(KnowledgeBase.slug == candidate)
        )
        if not existing.scalar_one_or_none():
            return candidate
        candidate = f"{slug}-{counter}"
        counter += 1


# ---------------------------------------------------------------------------
# GET /kb  — list my knowledge bases
# ---------------------------------------------------------------------------


@router.get("/kb")
async def list_my_kbs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role == "super_admin":
        result = await db.execute(select(KnowledgeBase))
        kbs = result.scalars().all()
    else:
        result = await db.execute(
            select(KnowledgeBase)
            .join(
                KnowledgeBaseMember,
                KnowledgeBaseMember.knowledge_base_id == KnowledgeBase.id,
            )
            .where(KnowledgeBaseMember.user_id == current_user.id)
        )
        kbs = result.scalars().all()

    out = []
    for kb in kbs:
        d = KbOut.model_validate(kb).model_dump()
        # member count
        mc = await db.execute(
            select(func.count(KnowledgeBaseMember.id)).where(
                KnowledgeBaseMember.knowledge_base_id == kb.id
            )
        )
        d["member_count"] = mc.scalar() or 0
        # doc count
        from app.models.document import Document
        dc = await db.execute(
            select(func.count(Document.id)).where(
                Document.knowledge_base_id == kb.id
            )
        )
        d["doc_count"] = dc.scalar() or 0
        out.append(d)

    return ok(out)


# ---------------------------------------------------------------------------
# POST /kb  — create knowledge base
# ---------------------------------------------------------------------------


@router.post("/kb", status_code=201)
async def create_kb(
    payload: KbCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    slug = await _unique_slug(payload.name, db)

    kb = KnowledgeBase(
        name=payload.name,
        slug=slug,
        description=payload.description,
        icon=payload.icon or "📁",
        visibility=payload.visibility,
        owner_id=current_user.id,
    )
    db.add(kb)
    await db.flush()

    # Creator becomes owner
    member = KnowledgeBaseMember(
        knowledge_base_id=kb.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(member)
    await db.flush()

    d = KbOut.model_validate(kb).model_dump()
    d["member_count"] = 1
    d["doc_count"] = 0
    d["my_role"] = "owner"
    return ok(d)


# ---------------------------------------------------------------------------
# GET /kb/slug/{slug}  — lookup by slug (for public page)
# ---------------------------------------------------------------------------


@router.get("/kb/slug/{slug}")
async def get_kb_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.slug == slug))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    if kb.visibility != "public":
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return ok(KbOut.model_validate(kb).model_dump())


# ---------------------------------------------------------------------------
# GET /kb/{kb_id}
# ---------------------------------------------------------------------------


@router.get("/kb/{kb_id}")
async def get_kb(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    kb = await _kb_or_404(kb_id, db)

    if current_user.role != "super_admin":
        role = await get_kb_member_role(db, kb_id, current_user.id)
        if role is None and kb.visibility != "public":
            raise HTTPException(status_code=403, detail="Access denied")

    mc = await db.execute(
        select(func.count(KnowledgeBaseMember.id)).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id
        )
    )
    from app.models.document import Document
    dc = await db.execute(
        select(func.count(Document.id)).where(Document.knowledge_base_id == kb_id)
    )
    d = KbOut.model_validate(kb).model_dump()
    d["member_count"] = mc.scalar() or 0
    d["doc_count"] = dc.scalar() or 0
    # Include caller's role if authenticated
    if current_user.role == "super_admin":
        d["my_role"] = "owner"
    else:
        my_role = await get_kb_member_role(db, kb_id, current_user.id)
        d["my_role"] = my_role
    return ok(d)


# ---------------------------------------------------------------------------
# PUT /kb/{kb_id}
# ---------------------------------------------------------------------------


@router.put("/kb/{kb_id}")
async def update_kb(
    kb_id: uuid.UUID,
    payload: KbUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("admin")),
):
    kb = await _kb_or_404(kb_id, db)

    if payload.name is not None:
        kb.name = payload.name
    if payload.description is not None:
        kb.description = payload.description
    if payload.icon is not None:
        kb.icon = payload.icon
    if payload.visibility is not None:
        kb.visibility = payload.visibility

    await db.flush()
    return ok(KbOut.model_validate(kb).model_dump())


# ---------------------------------------------------------------------------
# DELETE /kb/{kb_id}
# ---------------------------------------------------------------------------


@router.delete("/kb/{kb_id}")
async def delete_kb(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("owner")),
):
    kb = await _kb_or_404(kb_id, db)
    await db.delete(kb)
    return ok({"message": "Knowledge base deleted."})


# ---------------------------------------------------------------------------
# POST /kb/{kb_id}/transfer
# ---------------------------------------------------------------------------


class TransferRequest(BaseModel):
    new_owner_id: uuid.UUID


@router.post("/kb/{kb_id}/transfer")
async def transfer_kb(
    kb_id: uuid.UUID,
    payload: TransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("owner")),
):
    kb = await _kb_or_404(kb_id, db)

    # New owner must be an admin or already a member
    new_owner_role = await get_kb_member_role(db, kb_id, payload.new_owner_id)
    if new_owner_role is None:
        return err("NOT_A_MEMBER", "Target user is not a member of this KB.", 400)
    if ROLE_LEVELS.get(new_owner_role, 0) < ROLE_LEVELS["admin"]:
        return err("INSUFFICIENT_ROLE", "Target user must be an admin to receive ownership.", 400)

    # Update existing owner membership -> admin
    cur_owner_member_result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == current_user.id,
        )
    )
    cur_owner_member = cur_owner_member_result.scalar_one_or_none()
    if cur_owner_member:
        cur_owner_member.role = "admin"

    # Update new owner membership -> owner
    new_owner_member_result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == payload.new_owner_id,
        )
    )
    new_owner_member = new_owner_member_result.scalar_one_or_none()
    if new_owner_member:
        new_owner_member.role = "owner"

    kb.owner_id = payload.new_owner_id
    await db.flush()
    return ok({"message": "Ownership transferred successfully."})


# ---------------------------------------------------------------------------
# GET /kb/{kb_id}/members
# ---------------------------------------------------------------------------


@router.get("/kb/{kb_id}/members")
async def list_members(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("viewer")),
):
    result = await db.execute(
        select(KnowledgeBaseMember)
        .where(KnowledgeBaseMember.knowledge_base_id == kb_id)
        .order_by(KnowledgeBaseMember.joined_at.asc())
    )
    members = result.scalars().all()
    out = []
    for m in members:
        user_r = await db.execute(select(User).where(User.id == m.user_id))
        user = user_r.scalar_one_or_none()
        if user:
            md = MemberOut.model_validate(m).model_dump()
            md["user"] = UserOut.model_validate(user).model_dump()
            out.append(md)
    return ok(out)


# ---------------------------------------------------------------------------
# POST /kb/{kb_id}/members
# ---------------------------------------------------------------------------


@router.post("/kb/{kb_id}/members", status_code=201)
async def add_member(
    kb_id: uuid.UUID,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("admin")),
):
    # Check user exists
    user_result = await db.execute(select(User).where(User.id == payload.user_id))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        return err("USER_NOT_FOUND", "Target user not found.", 404)

    existing = await get_kb_member_role(db, kb_id, payload.user_id)
    if existing:
        return err("ALREADY_MEMBER", "User is already a member.", 409)

    member = KnowledgeBaseMember(
        knowledge_base_id=kb_id,
        user_id=payload.user_id,
        role=payload.role,
        invited_by=current_user.id,
    )
    db.add(member)
    await db.flush()

    md = MemberOut.model_validate(member).model_dump()
    md["user"] = UserOut.model_validate(target_user).model_dump()
    return ok(md)


# ---------------------------------------------------------------------------
# PUT /kb/{kb_id}/members/{user_id}
# ---------------------------------------------------------------------------


@router.put("/kb/{kb_id}/members/{user_id}")
async def update_member_role(
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("admin")),
):
    result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner":
        return err("CANNOT_CHANGE_OWNER", "Cannot change the role of the owner.", 403)

    # Admin cannot promote someone to admin/owner if they are not owner
    if role != "owner" and ROLE_LEVELS.get(payload.role, 0) >= ROLE_LEVELS["owner"]:
        return err("FORBIDDEN", "Only the owner can assign owner role.", 403)

    member.role = payload.role
    await db.flush()

    user_r = await db.execute(select(User).where(User.id == user_id))
    user = user_r.scalar_one()
    md = MemberOut.model_validate(member).model_dump()
    md["user"] = UserOut.model_validate(user).model_dump()
    return ok(md)


# ---------------------------------------------------------------------------
# DELETE /kb/{kb_id}/members/{user_id}
# ---------------------------------------------------------------------------


@router.delete("/kb/{kb_id}/members/{user_id}")
async def remove_member(
    kb_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    role: str = Depends(require_kb_role("admin")),
):
    result = await db.execute(
        select(KnowledgeBaseMember).where(
            KnowledgeBaseMember.knowledge_base_id == kb_id,
            KnowledgeBaseMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner":
        return err("CANNOT_REMOVE_OWNER", "Cannot remove the owner.", 403)

    await db.delete(member)
    return ok({"message": "Member removed."})
