"""
Knowledge Base CRUD and membership tests.

API routes use /api/v1/kb (not /kbs).
Responses are wrapped: {"success": bool, "data": ..., "error": ...}.
Member routes use user_id param (not member record ID).
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Helper: create a second regular user in-test
# ---------------------------------------------------------------------------

async def _make_user(async_db: AsyncSession, *, username: str, email: str):
    from app.models.user import User
    from app.utils.auth import hash_password

    user = User(
        id=uuid.uuid4(),
        username=username,
        display_name=username.capitalize(),
        email=email,
        password_hash=hash_password("TestPass123!"),
        role="user",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# KB CRUD
# ---------------------------------------------------------------------------

class TestKbCrud:

    async def test_create_kb(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """Owner can create a new knowledge base."""
        headers = await auth_headers(test_user)
        payload = {
            "name": "My New KB",
            "description": "A fresh knowledge base",
            "visibility": "private",
        }
        resp = await async_client.post("/api/v1/kb", json=payload, headers=headers)
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["name"] == "My New KB"
        assert data.get("slug")
        assert data["owner_id"] == str(test_user.id)

    async def test_create_kb_auto_slug(
        self, async_client: AsyncClient, test_user, auth_headers
    ):
        """Slug is auto-generated from the name."""
        headers = await auth_headers(test_user)
        payload = {"name": "Auto Slug Test KB", "visibility": "private"}
        resp = await async_client.post("/api/v1/kb", json=payload, headers=headers)
        assert resp.status_code == 201, resp.text
        slug = resp.json()["data"]["slug"]
        assert slug  # non-empty slug

    async def test_list_my_kbs(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Listing my knowledge bases includes at least the fixture KB."""
        headers = await auth_headers(test_user)
        resp = await async_client.get("/api/v1/kb", headers=headers)
        assert resp.status_code == 200, resp.text
        items = resp.json()["data"]
        ids = [kb["id"] for kb in items]
        assert str(test_kb.id) in ids

    async def test_get_kb_detail(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Owner can retrieve KB detail."""
        headers = await auth_headers(test_user)
        resp = await async_client.get(
            f"/api/v1/kb/{test_kb.id}", headers=headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["id"] == str(test_kb.id)

    async def test_update_kb(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Owner can update name/description (PUT)."""
        headers = await auth_headers(test_user)
        resp = await async_client.put(
            f"/api/v1/kb/{test_kb.id}",
            json={"name": "Renamed KB", "description": "Updated desc"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["name"] == "Renamed KB"

    async def test_delete_kb_owner(
        self, async_client: AsyncClient, test_user, auth_headers, async_db: AsyncSession
    ):
        """Owner can delete their knowledge base."""
        from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember

        kb = KnowledgeBase(
            id=uuid.uuid4(),
            name="Delete Me",
            slug="delete-me-kb",
            visibility="private",
            owner_id=test_user.id,
        )
        async_db.add(kb)
        await async_db.flush()
        async_db.add(
            KnowledgeBaseMember(
                id=uuid.uuid4(),
                knowledge_base_id=kb.id,
                user_id=test_user.id,
                role="owner",
            )
        )
        await async_db.commit()

        headers = await auth_headers(test_user)
        resp = await async_client.delete(f"/api/v1/kb/{kb.id}", headers=headers)
        assert resp.status_code == 200, resp.text

    async def test_delete_kb_non_owner(
        self, async_client: AsyncClient, test_kb, async_db: AsyncSession, auth_headers
    ):
        """Non-owner (non-member) cannot delete a KB."""
        other = await _make_user(async_db, username="nonowner", email="nonowner@example.com")
        headers = await auth_headers(other)
        resp = await async_client.delete(f"/api/v1/kb/{test_kb.id}", headers=headers)
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Membership management
# ---------------------------------------------------------------------------

class TestKbMembership:

    async def test_add_member(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Owner can invite another user as editor."""
        other = await _make_user(async_db, username="invited", email="invited@example.com")
        headers = await auth_headers(test_user)
        resp = await async_client.post(
            f"/api/v1/kb/{test_kb.id}/members",
            json={"user_id": str(other.id), "role": "editor"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["user_id"] == str(other.id)
        assert data["role"] == "editor"

    async def test_add_member_duplicate(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Adding the same user twice returns 409."""
        other = await _make_user(async_db, username="dupinvite", email="dupinvite@example.com")
        headers = await auth_headers(test_user)
        payload = {"user_id": str(other.id), "role": "viewer"}
        await async_client.post(
            f"/api/v1/kb/{test_kb.id}/members", json=payload, headers=headers
        )
        resp = await async_client.post(
            f"/api/v1/kb/{test_kb.id}/members", json=payload, headers=headers
        )
        assert resp.status_code == 409, resp.text

    async def test_update_member_role(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Owner can change a member's role via PUT /kb/{kb_id}/members/{user_id}."""
        other = await _make_user(async_db, username="rolechange", email="rolechange@example.com")
        # Add member first
        headers = await auth_headers(test_user)
        await async_client.post(
            f"/api/v1/kb/{test_kb.id}/members",
            json={"user_id": str(other.id), "role": "viewer"},
            headers=headers,
        )
        resp = await async_client.put(
            f"/api/v1/kb/{test_kb.id}/members/{other.id}",
            json={"role": "editor"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["role"] == "editor"

    async def test_cannot_change_owner_role(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Cannot demote the owner's role via member update."""
        headers = await auth_headers(test_user)
        resp = await async_client.put(
            f"/api/v1/kb/{test_kb.id}/members/{test_user.id}",
            json={"role": "editor"},
            headers=headers,
        )
        assert resp.status_code in (400, 403), resp.text

    async def test_remove_member(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Owner can remove a non-owner member."""
        other = await _make_user(async_db, username="removeme", email="removeme@example.com")
        headers = await auth_headers(test_user)
        # Add member
        await async_client.post(
            f"/api/v1/kb/{test_kb.id}/members",
            json={"user_id": str(other.id), "role": "editor"},
            headers=headers,
        )
        resp = await async_client.delete(
            f"/api/v1/kb/{test_kb.id}/members/{other.id}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_cannot_remove_owner(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Cannot remove the owner membership."""
        headers = await auth_headers(test_user)
        resp = await async_client.delete(
            f"/api/v1/kb/{test_kb.id}/members/{test_user.id}",
            headers=headers,
        )
        assert resp.status_code in (400, 403), resp.text

    async def test_transfer_ownership(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Owner can transfer ownership to an existing admin member."""
        from app.models.knowledge_base import KnowledgeBaseMember

        new_owner = await _make_user(async_db, username="newowner", email="newowner@example.com")
        member = KnowledgeBaseMember(
            id=uuid.uuid4(),
            knowledge_base_id=test_kb.id,
            user_id=new_owner.id,
            role="admin",
        )
        async_db.add(member)
        await async_db.commit()

        headers = await auth_headers(test_user)
        resp = await async_client.post(
            f"/api/v1/kb/{test_kb.id}/transfer",
            json={"new_owner_id": str(new_owner.id)},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
