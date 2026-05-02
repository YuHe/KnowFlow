from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserOut
from app.utils.auth import get_current_active_user, hash_password, verify_password
from app.utils.response import err, ok

router = APIRouter(tags=["users"])


class UserUpdatePayload(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=128)
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None


class PasswordChangePayload(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


# ---------------------------------------------------------------------------
# GET /users  — search users
# ---------------------------------------------------------------------------


@router.get("/users")
async def search_users(
    q: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_active_user),
):
    stmt = select(User).where(User.is_active == True)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                User.username.ilike(pattern),
                User.display_name.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    stmt = stmt.limit(min(limit, 50))
    result = await db.execute(stmt)
    users = result.scalars().all()
    return ok([UserOut.model_validate(u).model_dump() for u in users])


# ---------------------------------------------------------------------------
# GET /users/{user_id}  — public profile
# ---------------------------------------------------------------------------


@router.get("/users/{user_id}")
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return ok(UserOut.model_validate(user).model_dump())


# ---------------------------------------------------------------------------
# PUT /users/me  — update current user profile
# ---------------------------------------------------------------------------


@router.put("/users/me")
async def update_me(
    payload: UserUpdatePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if payload.email and payload.email != current_user.email:
        dup = await db.execute(
            select(User).where(User.email == payload.email, User.id != current_user.id)
        )
        if dup.scalar_one_or_none():
            return err("DUPLICATE_EMAIL", "Email already in use.", 409)
        current_user.email = payload.email

    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url

    await db.flush()
    return ok(UserOut.model_validate(current_user).model_dump())


# ---------------------------------------------------------------------------
# PUT /users/me/password  — change password
# ---------------------------------------------------------------------------


@router.put("/users/me/password")
async def change_password(
    payload: PasswordChangePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not verify_password(payload.old_password, current_user.password_hash):
        return err("WRONG_PASSWORD", "Current password is incorrect.", 400)

    current_user.password_hash = hash_password(payload.new_password)
    await db.flush()
    return ok({"message": "Password changed successfully."})
