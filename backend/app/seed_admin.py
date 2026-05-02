"""
seed_admin.py
=============
Creates the super-admin account on first run.
Reads credentials from the application config (or .env file).

Usage::

    python -m app.seed_admin
    # or
    python app/seed_admin.py
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models import User  # noqa: F401 – ensures table metadata is registered
from app.database import Base
from app.utils.auth import hash_password


async def seed_admin() -> None:
    # Ensure tables exist (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if the super-admin already exists (by email or username)
        result = await db.execute(
            select(User).where(
                (User.email == settings.SUPER_ADMIN_EMAIL)
                | (User.username == settings.SUPER_ADMIN_USERNAME)
            )
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            print(
                f"[seed_admin] Super-admin already exists "
                f"(username={existing.username!r}, email={existing.email!r}). "
                "Skipping."
            )
            return

        admin = User(
            username=settings.SUPER_ADMIN_USERNAME,
            display_name=settings.SUPER_ADMIN_USERNAME.capitalize(),
            email=settings.SUPER_ADMIN_EMAIL,
            password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
            role="super_admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        print(
            f"[seed_admin] Created super-admin: "
            f"username={admin.username!r}, email={admin.email!r}"
        )


if __name__ == "__main__":
    asyncio.run(seed_admin())
    sys.exit(0)
