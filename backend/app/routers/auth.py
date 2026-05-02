from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.utils.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_active_user,
    hash_password,
    verify_password,
)
from app.utils.response import err, ok

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days in seconds


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    from app.config import settings

    if not settings.ALLOW_REGISTRATION:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently disabled.",
        )

    # Check uniqueness
    existing = await db.execute(
        select(User).where(
            or_(User.username == payload.username, User.email == payload.email)
        )
    )
    if existing.scalar_one_or_none():
        return err("DUPLICATE_USER", "Username or email already exists.", 409)

    user = User(
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
    )

    return ok(
        TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=UserOut.model_validate(user),
        ).model_dump()
    )


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


@router.post("/login")
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(
            or_(User.username == payload.account, User.email == payload.account)
        )
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        return err("INVALID_CREDENTIALS", "Incorrect username/email or password.", 401)

    if not user.is_active:
        return err("ACCOUNT_DISABLED", "This account has been disabled.", 403)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
    )

    return ok(
        TokenResponse(
            access_token=access_token,
            token_type="bearer",
            user=UserOut.model_validate(user),
        ).model_dump()
    )


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get(_REFRESH_COOKIE)
    if not token:
        return err("MISSING_REFRESH_TOKEN", "Refresh token not found.", 401)

    payload = decode_token(token)
    if payload is None or payload.get("type") != "refresh":
        return err("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token.", 401)

    user_id = payload.get("sub")
    if not user_id:
        return err("INVALID_REFRESH_TOKEN", "Invalid token subject.", 401)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return err("USER_NOT_FOUND", "User not found or disabled.", 401)

    new_access = create_access_token({"sub": str(user.id)})
    new_refresh = create_refresh_token({"sub": str(user.id)})

    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=new_refresh,
        httponly=True,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
    )

    return ok({"access_token": new_access, "token_type": "bearer"})


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=_REFRESH_COOKIE)
    return ok({"message": "Logged out successfully."})


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_active_user)):
    return ok(UserOut.model_validate(current_user).model_dump())


# ---------------------------------------------------------------------------
# PUT /auth/me
# ---------------------------------------------------------------------------


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None

    model_config = {"extra": "ignore"}


@router.put("/me")
async def update_me(
    payload: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if payload.display_name is not None:
        current_user.display_name = payload.display_name
    if payload.email is not None:
        # Check email uniqueness
        existing = await db.execute(
            select(User).where(User.email == payload.email, User.id != current_user.id)
        )
        if existing.scalar_one_or_none():
            return err("EMAIL_TAKEN", "Email already in use by another account.", 409)
        current_user.email = payload.email
    await db.flush()
    return ok(UserOut.model_validate(current_user).model_dump())


# ---------------------------------------------------------------------------
# POST /auth/change-password
# ---------------------------------------------------------------------------


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        return err("WRONG_PASSWORD", "Current password is incorrect.", 400)
    current_user.password_hash = hash_password(payload.new_password)
    await db.flush()
    return ok({"message": "Password changed successfully."})
