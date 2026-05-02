"""
Admin (super_admin) endpoint tests.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_user(async_db: AsyncSession, *, username: str, email: str, role: str = "user"):
    from app.models.user import User
    from app.utils.auth import hash_password

    user = User(
        id=uuid.uuid4(),
        username=username,
        display_name=username,
        email=email,
        password_hash=hash_password("TestPass123!"),
        role=role,
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


async def _make_kb(async_db: AsyncSession, owner_id, *, name: str, slug: str):
    from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember

    kb = KnowledgeBase(
        id=uuid.uuid4(),
        name=name,
        slug=slug,
        visibility="private",
        owner_id=owner_id,
    )
    async_db.add(kb)
    await async_db.flush()
    async_db.add(
        KnowledgeBaseMember(
            id=uuid.uuid4(),
            knowledge_base_id=kb.id,
            user_id=owner_id,
            role="owner",
        )
    )
    await async_db.commit()
    await async_db.refresh(kb)
    return kb


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------

class TestAdminAccess:

    async def test_non_admin_cannot_access(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """Regular users must be rejected from admin endpoints (403)."""
        headers = await auth_headers(test_user)
        resp = await async_client.get("/api/v1/admin/stats", headers=headers)
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Admin functionality
# ---------------------------------------------------------------------------

class TestAdminFunctionality:

    async def test_get_stats(
        self, async_client: AsyncClient, test_superadmin, auth_headers
    ):
        """Super admin can retrieve system statistics."""
        headers = await auth_headers(test_superadmin)
        resp = await async_client.get("/api/v1/admin/stats", headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert "total_users" in data or "users" in data

    async def test_get_users(
        self, async_client: AsyncClient, test_superadmin, test_user, auth_headers
    ):
        """Super admin can list all users."""
        headers = await auth_headers(test_superadmin)
        resp = await async_client.get("/api/v1/admin/users", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()["data"]
        items = body if isinstance(body, list) else body.get("items", [])
        user_ids = [str(u["id"]) for u in items]
        assert str(test_user.id) in user_ids

    async def test_update_user_role(
        self, async_client: AsyncClient, test_superadmin, async_db, auth_headers
    ):
        """Super admin can change a user's system role."""
        target = await _make_user(async_db, username="roleupdate_target", email="roleupdate@example.com")
        headers = await auth_headers(test_superadmin)
        resp = await async_client.put(
            f"/api/v1/admin/users/{target.id}/role",
            json={"role": "super_admin"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["role"] == "super_admin"

    async def test_cannot_disable_self(
        self, async_client: AsyncClient, test_superadmin, auth_headers
    ):
        """Super admin cannot disable their own account."""
        headers = await auth_headers(test_superadmin)
        resp = await async_client.put(
            f"/api/v1/admin/users/{test_superadmin.id}/status",
            json={"is_active": False},
            headers=headers,
        )
        assert resp.status_code in (400, 403), resp.text

    async def test_reset_password(
        self, async_client: AsyncClient, test_superadmin, async_db, auth_headers
    ):
        """Super admin can reset another user's password."""
        target = await _make_user(async_db, username="pwreset_target", email="pwreset@example.com")
        headers = await auth_headers(test_superadmin)
        resp = await async_client.post(
            f"/api/v1/admin/users/{target.id}/reset-password",
            headers=headers,
        )
        assert resp.status_code in (200, 204), resp.text

    async def test_admin_delete_kb(
        self, async_client: AsyncClient, test_superadmin, test_user, async_db, auth_headers
    ):
        """Super admin can forcibly delete any knowledge base."""
        kb = await _make_kb(
            async_db,
            test_user.id,
            name="Admin Will Delete KB",
            slug="admin-delete-target-kb",
        )
        headers = await auth_headers(test_superadmin)
        resp = await async_client.delete(
            f"/api/v1/admin/kb/{kb.id}",
            headers=headers,
        )
        assert resp.status_code in (200, 204), resp.text
