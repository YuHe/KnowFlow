"""
pytest fixtures for KnowFlow backend tests.

Uses SQLite in-memory database by default (override with TEST_DATABASE_URL env var).
Requires: pip install aiosqlite pytest-asyncio httpx
"""
from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Test database URL – default to in-memory SQLite
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:"
)

os.environ.setdefault("TEST_DATABASE_URL", TEST_DATABASE_URL)

# Storage writes must land somewhere writable. app.config defaults
# STORAGE_LOCAL_PATH to /app/uploads, which only exists inside the container,
# so importing the app would fail on a dev machine.
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/knowflow-test-uploads")


# ---------------------------------------------------------------------------
# Async engine / session
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def _engine():
    """Create a fresh engine and schema for each test.

    Function-scoped on purpose. This fixture used to be session-scoped, so all
    tests shared one in-memory database — and nothing reset it between them:
    `async_db` rolls back, but fixtures like `test_user` commit first, and a
    rollback after a commit is a no-op. `create_all`/`drop_all` ran once per
    session. The second test to build a user therefore hit
    `UNIQUE constraint failed: users.email`, which is what broke 84 of 89 tests
    at setup. Rebuilding the schema per test costs ~0.3s across the suite and
    gives real isolation.
    """
    from app.database import Base  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.knowledge_base  # noqa: F401
    import app.models.document  # noqa: F401

    kwargs = {"echo": False}
    if "sqlite" in TEST_DATABASE_URL:
        # StaticPool keeps the single in-memory connection alive across
        # sessions; with a per-connection pool each connection would get its
        # own empty database and lose the schema (NullPool here yields
        # "no such table: users"). This is already the default for a
        # `:memory:` URL — stated explicitly because the fixtures depend on it.
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool

    engine = create_async_engine(TEST_DATABASE_URL, **kwargs)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def async_db(_engine) -> AsyncGenerator[AsyncSession, None]:
    """Function-scoped DB session. Isolation comes from the per-test engine."""
    TestSession = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    async with TestSession() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def async_client(async_db) -> AsyncGenerator[AsyncClient, None]:
    """
    httpx.AsyncClient that points at the FastAPI app.

    We override the `get_db` and `get_redis` dependencies so that every
    request uses the test session and a mock Redis.
    """
    from unittest.mock import AsyncMock

    from app.database import get_db, get_redis
    from app.main import app

    async def _override_get_db():
        yield async_db

    async def _override_get_redis():
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        mock_redis.set.return_value = True
        mock_redis.setex.return_value = True
        mock_redis.hset.return_value = True
        mock_redis.delete.return_value = 1
        yield mock_redis

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = _override_get_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def test_user(async_db: AsyncSession):
    """Create and persist a regular test user."""
    from app.models.user import User
    from app.utils.auth import hash_password

    user = User(
        id=uuid.uuid4(),
        username="testuser",
        display_name="Test User",
        email="testuser@example.com",
        password_hash=hash_password("TestPass123!"),
        role="user",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_superadmin(async_db: AsyncSession):
    """Create and persist a super-admin user."""
    from app.models.user import User
    from app.utils.auth import hash_password

    user = User(
        id=uuid.uuid4(),
        username="superadmin",
        display_name="Super Admin",
        email="superadmin@example.com",
        password_hash=hash_password("AdminPass123!"),
        role="super_admin",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Auth header helper
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_headers():
    """
    Return a helper that obtains bearer headers for a given user.

    Usage::

        headers = await auth_headers(test_user)
    """
    async def _get_headers(user) -> dict[str, str]:
        from app.utils.auth import create_access_token
        token = create_access_token({"sub": str(user.id)})
        return {"Authorization": f"Bearer {token}"}

    return _get_headers


# ---------------------------------------------------------------------------
# Knowledge base fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def test_kb(async_db: AsyncSession, test_user):
    """Create a private knowledge base owned by test_user."""
    from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember

    kb = KnowledgeBase(
        id=uuid.uuid4(),
        name="Test KB",
        slug="test-kb",
        description="A test knowledge base",
        visibility="private",
        owner_id=test_user.id,
    )
    async_db.add(kb)
    await async_db.flush()

    member = KnowledgeBaseMember(
        id=uuid.uuid4(),
        knowledge_base_id=kb.id,
        user_id=test_user.id,
        role="owner",
    )
    async_db.add(member)
    await async_db.commit()
    await async_db.refresh(kb)
    return kb
