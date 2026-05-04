from __future__ import annotations

import asyncio
import logging
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import close_redis

logger = logging.getLogger("knowflow")

# ---------------------------------------------------------------------------
# Lifespan: run alembic upgrade + warm up connections
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run database migrations
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True,
        )
        logger.info("Alembic migration output: %s", result.stdout)
    except subprocess.CalledProcessError as exc:
        logger.error("Alembic migration failed: %s\n%s", exc.stdout, exc.stderr)
        # Don't exit – let the app start so health checks can report the problem
    except FileNotFoundError:
        logger.warning("alembic not found in PATH – skipping migration on startup")

    # Seed super admin user if not exists
    try:
        await _seed_super_admin()
    except Exception as exc:
        logger.error("Super admin seeding failed: %s", exc)

    # Clean up expired trash (docs deleted > 30 days ago)
    try:
        await _cleanup_expired_trash()
    except Exception as exc:
        logger.error("Initial trash cleanup failed: %s", exc)

    # Start periodic trash cleanup (daily)
    cleanup_task = asyncio.create_task(_trash_cleanup_loop())

    yield

    cleanup_task.cancel()
    await close_redis()


async def _cleanup_expired_trash() -> None:
    """Permanently delete documents that have been in trash for more than 30 days."""
    from sqlalchemy import delete

    from app.database import AsyncSessionLocal
    from app.models.document import Document

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(Document).where(
                Document.deleted_at.is_not(None),
                Document.deleted_at < cutoff,
            )
        )
        await db.commit()
    logger.info("Trash cleanup complete (cutoff: %s)", cutoff.date())


async def _trash_cleanup_loop() -> None:
    """Run trash cleanup once per day."""
    while True:
        await asyncio.sleep(24 * 3600)
        try:
            await _cleanup_expired_trash()
        except Exception as exc:
            logger.error("Periodic trash cleanup failed: %s", exc)


async def _seed_super_admin() -> None:
    """Create the initial super admin user if it doesn't exist."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.utils.auth import hash_password

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.username == settings.SUPER_ADMIN_USERNAME)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            admin = User(
                username=settings.SUPER_ADMIN_USERNAME,
                display_name="Administrator",
                email=settings.SUPER_ADMIN_EMAIL,
                password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
                role="super_admin",
                is_active=True,
            )
            db.add(admin)
            await db.commit()
            logger.info("Super admin user '%s' created.", settings.SUPER_ADMIN_USERNAME)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(
        title="KnowFlow API",
        version="1.0.0",
        description="KnowFlow Knowledge Base API",
        lifespan=lifespan,
    )

    # ------------------------------------------------------------------
    # CORS
    # ------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # Static files (uploaded assets)
    # ------------------------------------------------------------------
    uploads_path = Path(settings.STORAGE_LOCAL_PATH)
    uploads_path.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads",
        StaticFiles(directory=str(uploads_path)),
        name="uploads",
    )

    # ------------------------------------------------------------------
    # Routers
    # ------------------------------------------------------------------
    from app.routers import (
        admin,
        assets,
        auth,
        comments,
        docs,
        favorites,
        import_,
        kb,
        public,
        search,
        sections,
        shares,
        templates,
        users,
        versions,
    )

    API_PREFIX = "/api/v1"

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(users.router, prefix=API_PREFIX)
    app.include_router(kb.router, prefix=API_PREFIX)
    app.include_router(sections.router, prefix=API_PREFIX)
    app.include_router(docs.router, prefix=API_PREFIX)
    app.include_router(versions.router, prefix=API_PREFIX)
    app.include_router(comments.router, prefix=API_PREFIX)
    app.include_router(favorites.router, prefix=API_PREFIX)
    app.include_router(search.router, prefix=API_PREFIX)
    app.include_router(templates.router, prefix=API_PREFIX)
    app.include_router(shares.router, prefix=API_PREFIX)
    app.include_router(assets.router, prefix=API_PREFIX)
    app.include_router(import_.router, prefix=API_PREFIX)
    app.include_router(public.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)

    # ------------------------------------------------------------------
    # Global error handlers
    # ------------------------------------------------------------------

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed",
                    "details": exc.errors(),
                },
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred.",
                },
            },
        )

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    @app.get("/health", tags=["health"])
    async def health_check():
        return {"status": "ok", "service": "KnowFlow API"}

    return app


app = create_app()
