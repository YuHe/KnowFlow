"""
pytest fixtures for KnowFlow backend tests.

Uses SQLite in-memory database by default (override with TEST_DATABASE_URL env var).
Requires: pip install aiosqlite pytest-asyncio httpx
"""
from __future__ import annotations

import asyncio
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

# ---------------------------------------------------------------------------
# Test database URL – default to in-memory SQLite
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:"
)

os.environ.setdefault("TEST_DATABASE_URL", TEST_DATABASE_URL)


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop (required for session-scoped async fixtures)."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Async engine / session
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def _engine():
    """Create the test engine and initialise the schema once per session."""
    from app.database import Base  # noqa: F401
    import app.models.user  # noqa: F401
    import app.models.knowledge_base  # noqa: F401
    import app.models.document  # noqa: F401

    connect_args = {}
    if "sqlite" in TEST_DATABASE_URL:
        connect_args = {"check_same_thread": False}

    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args=connect_args,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def async_db(_engine) -> AsyncGenerator[AsyncSession, None]:
    """Function-scoped DB session that rolls back after each test."""
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
