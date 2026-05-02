from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Asset, Document
from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember
from app.models.user import User
from app.utils.auth import get_current_active_user, hash_password, require_role
from app.utils.response import err, ok, paginate

router = APIRouter(prefix="/admin", tags=["admin"])


# ---- Permission guard (applied to every route via dependency) ---------------

_super_admin = Depends(require_role("super_admin"))


# ---- Schemas ----------------------------------------------------------------


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(user|super_admin)$")


class UserStatusUpdate(BaseModel):
    is_active: bool


class KBTransferRequest(BaseModel):
    new_owner_id: uuid.UUID


# ---- Helpers ----------------------------------------------------------------


def _user_to_dict(u: User) -> dict:
    return {
        "id": str(u.id),
        "username": u.username,
        "display_name": u.display_name,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "avatar_url": u.avatar_url,
        "created_at": u.created_at.isoformat(),
        "updated_at": u.updated_at.isoformat(),
    }


def _kb_to_dict(kb: KnowledgeBase) -> dict:
    return {
        "id": str(kb.id),
        "name": kb.name,
        "slug": kb.slug,
        "description": kb.description,
        "icon": kb.icon,
        "visibility": kb.visibility,
        "owner_id": str(kb.owner_id),
        "created_at": kb.created_at.isoformat(),
        "updated_at": kb.updated_at.isoformat(),
    }


# ---- Routes ----------------------------------------------------------------


# GET /admin/stats
@router.get("/stats", dependencies=[_super_admin])
async def get_stats(db: AsyncSession = Depends(get_db)):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_kbs = (await db.execute(select(func.count(KnowledgeBase.id)))).scalar() or 0
    total_docs = (await db.execute(select(func.count(Document.id)))).scalar() or 0

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    active_7d = (
        await db.execute(
            select(func.count(User.id)).where(User.updated_at >= seven_days_ago)
        )
    ).scalar() or 0

    new_docs_30d = (
        await db.execute(
            select(func.count(Document.id)).where(Document.created_at >= thirty_days_ago)
        )
    ).scalar() or 0

    storage_bytes = (
        await db.execute(select(func.coalesce(func.sum(Asset.size_bytes), 0)))
    ).scalar() or 0

    kbs_result = await db.execute(select(KnowledgeBase.visibility))
    kbs_visibility = kbs_result.scalars().all()
    public_kbs = sum(1 for v in kbs_visibility if v == "public")
    private_kbs = total_kbs - public_kbs

    return ok(
        {
            "total_users": total_users,
            "total_kbs": total_kbs,
            "public_kbs": public_kbs,
            "private_kbs": private_kbs,
            "total_docs": total_docs,
            "active_users_7d": active_7d,
            "new_docs_30d": new_docs_30d,
            "storage_bytes": storage_bytes,
        }
    )


# GET /admin/users
@router.get("/users", dependencies=[_super_admin])
async def list_users(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    offset = (page - 1) * page_size

    stmt = select(User)
    if q:
        pattern = f"%{q}%"
        from sqlalchemy import or_
        stmt = stmt.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar() or 0

    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    users = result.scalars().all()

    return paginate([_user_to_dict(u) for u in users], total, page, page_size)


# PUT /admin/users/{user_id}/role
@router.put("/users/{user_id}/role", dependencies=[_super_admin])
async def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = payload.role
    await db.flush()
    return ok(_user_to_dict(user))


# PUT /admin/users/{user_id}/status
@router.put("/users/{user_id}/status", dependencies=[_super_admin])
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == current_user.id:
        return err("CANNOT_DISABLE_SELF", "You cannot disable your own account.", 400)

    # Ensure at least one active super_admin remains
    if not payload.is_active and user.role == "super_admin":
        active_admins = (
            await db.execute(
                select(func.count(User.id)).where(
                    User.role == "super_admin",
                    User.is_active == True,
                    User.id != user_id,
                )
            )
        ).scalar() or 0
        if active_admins == 0:
            return err(
                "LAST_SUPER_ADMIN",
                "Cannot disable the last active super_admin.",
                400,
            )

    user.is_active = payload.is_active
    await db.flush()
    return ok(_user_to_dict(user))


# POST /admin/users/{user_id}/reset-password
@router.post("/users/{user_id}/reset-password", dependencies=[_super_admin])
async def reset_user_password(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = secrets.token_urlsafe(12)
    user.password_hash = hash_password(temp_password)
    await db.flush()
    return ok({"temp_password": temp_password, "message": "Password reset successfully."})


# GET /admin/kb
@router.get("/kb", dependencies=[_super_admin])
async def admin_list_kbs(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    offset = (page - 1) * page_size

    stmt = select(KnowledgeBase)
    if q:
        stmt = stmt.where(KnowledgeBase.name.ilike(f"%{q}%"))

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar() or 0

    stmt = stmt.order_by(KnowledgeBase.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(stmt)
    kbs = result.scalars().all()

    out = []
    for kb in kbs:
        d = _kb_to_dict(kb)
        mc = (
            await db.execute(
                select(func.count(KnowledgeBaseMember.id)).where(
                    KnowledgeBaseMember.knowledge_base_id == kb.id
                )
            )
        ).scalar() or 0
        d["member_count"] = mc
        out.append(d)

    return paginate(out, total, page, page_size)


# GET /admin/kb/{kb_id}
@router.get("/kb/{kb_id}", dependencies=[_super_admin])
async def admin_get_kb(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    mc = (
        await db.execute(
            select(func.count(KnowledgeBaseMember.id)).where(
                KnowledgeBaseMember.knowledge_base_id == kb_id
            )
        )
    ).scalar() or 0
    d = _kb_to_dict(kb)
    d["member_count"] = mc
    return ok(d)


# DELETE /admin/kb/{kb_id}
@router.delete("/kb/{kb_id}", dependencies=[_super_admin])
async def admin_delete_kb(
    kb_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    await db.delete(kb)
    return ok({"message": "Knowledge base deleted."})


# POST /admin/kb/{kb_id}/transfer
@router.post("/kb/{kb_id}/transfer", dependencies=[_super_admin])
async def admin_transfer_kb(
    kb_id: uuid.UUID,
    payload: KBTransferRequest,
    db: AsyncSession = Depends(get_db),
):
    kb_result = await db.execute(select(KnowledgeBase).where(KnowledgeBase.id == kb_id))
    kb = kb_result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    new_owner_result = await db.execute(select(User).where(User.id == payload.new_owner_id))
    new_owner = new_owner_result.scalar_one_or_none()
    if not new_owner:
        return err("USER_NOT_FOUND", "Target user not found.", 404)

    old_owner_id = kb.owner_id
    kb.owner_id = payload.new_owner_id

    # Update membership records
    old_owner_member = (
        await db.execute(
            select(KnowledgeBaseMember).where(
                KnowledgeBaseMember.knowledge_base_id == kb_id,
                KnowledgeBaseMember.user_id == old_owner_id,
                KnowledgeBaseMember.role == "owner",
            )
        )
    ).scalar_one_or_none()
    if old_owner_member:
        old_owner_member.role = "admin"

    new_owner_member = (
        await db.execute(
            select(KnowledgeBaseMember).where(
                KnowledgeBaseMember.knowledge_base_id == kb_id,
                KnowledgeBaseMember.user_id == payload.new_owner_id,
            )
        )
    ).scalar_one_or_none()

    if new_owner_member:
        new_owner_member.role = "owner"
    else:
        db.add(
            KnowledgeBaseMember(
                knowledge_base_id=kb_id,
                user_id=payload.new_owner_id,
                role="owner",
            )
        )

    await db.flush()
    return ok({"message": "Ownership transferred."})


# GET /admin/settings
@router.get("/settings", dependencies=[_super_admin])
async def get_settings():
    from app.config import settings

    return ok(
        {
            "site_name": settings.SITE_NAME,
            "site_description": settings.SITE_DESCRIPTION,
            "allow_registration": settings.ALLOW_REGISTRATION,
            "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
            "image_max_size_mb": settings.IMAGE_MAX_SIZE_MB,
            "max_versions_per_doc": settings.MAX_VERSIONS_PER_DOC,
        }
    )


class SettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    site_description: Optional[str] = None
    allow_registration: Optional[bool] = None
    max_upload_size_mb: Optional[int] = None
    image_max_size_mb: Optional[int] = None
    max_versions_per_doc: Optional[int] = None


# PUT /admin/settings
@router.put("/settings", dependencies=[_super_admin])
async def update_settings(
    payload: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Persist runtime settings to Redis so they survive restarts.
    If Redis is unavailable, updates are applied in-memory only for the
    current process lifetime.
    """
    from app.config import settings
    from app.database import get_redis_pool

    field_map = {
        "site_name": "SITE_NAME",
        "site_description": "SITE_DESCRIPTION",
        "allow_registration": "ALLOW_REGISTRATION",
        "max_upload_size_mb": "MAX_UPLOAD_SIZE_MB",
        "image_max_size_mb": "IMAGE_MAX_SIZE_MB",
        "max_versions_per_doc": "MAX_VERSIONS_PER_DOC",
    }

    updated: dict = {}
    for field, value in payload.model_dump(exclude_none=True).items():
        settings_key = field_map.get(field)
        if settings_key:
            setattr(settings, settings_key, value)
            updated[field] = value

    # Best-effort Redis persistence
    try:
        redis = get_redis_pool()
        for k, v in updated.items():
            await redis.hset("knowflow:settings", k, str(v))
    except Exception:
        pass  # Redis unavailable – settings live in memory only

    return ok({"updated": updated, "message": "Settings updated."})
