"""
Permission matrix tests – PRD 2.4 / F36 / N06.

Tests every combination of role × action and verifies the correct HTTP status.

Roles tested: viewer, editor (own doc vs other's doc), admin, owner, non-member.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_user(async_db: AsyncSession, *, username: str, email: str):
    from app.models.user import User
    from app.utils.auth import hash_password

    user = User(
        id=uuid.uuid4(),
        username=username,
        display_name=username,
        email=email,
        password_hash=hash_password("TestPass123!"),
        role="user",
        is_active=True,
    )
    async_db.add(user)
    await async_db.commit()
    await async_db.refresh(user)
    return user


async def _add_member(async_db: AsyncSession, kb_id, user_id, role: str):
    from app.models.knowledge_base import KnowledgeBaseMember

    member = KnowledgeBaseMember(
        id=uuid.uuid4(),
        knowledge_base_id=kb_id,
        user_id=user_id,
        role=role,
    )
    async_db.add(member)
    await async_db.commit()
    return member


async def _create_doc_direct(async_client, kb_id, headers, title="Perm Doc"):
    resp = await async_client.post(
        f"/api/v1/kb/{kb_id}/docs",
        json={"title": title, "content_md": "# content", "content_html": "<p>content</p>"},
        headers=headers,
    )
    assert resp.status_code == 201, f"Setup doc creation failed: {resp.text}"
    return resp.json()["data"]


# ---------------------------------------------------------------------------
# Viewer permissions
# ---------------------------------------------------------------------------

class TestViewerPermissions:
    """Viewer can only read; no write operations are allowed."""

    @pytest.fixture(autouse=True)
    async def setup(self, async_client, test_user, test_kb, async_db, auth_headers):
        self.async_client = async_client
        self.test_kb = test_kb
        self.async_db = async_db

        self.viewer = await _make_user(async_db, username="perm_viewer", email="perm_viewer@ex.com")
        await _add_member(async_db, test_kb.id, self.viewer.id, "viewer")
        self.viewer_headers = await auth_headers(self.viewer)

        self.owner_headers = await auth_headers(test_user)
        self.owner_doc = await _create_doc_direct(async_client, test_kb.id, self.owner_headers, "Owner Doc for Viewer Tests")

    async def test_viewer_cannot_create_doc(self):
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/docs",
            json={"title": "Viewer Doc", "content_md": ""},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_edit_doc(self):
        resp = await self.async_client.put(
            f"/api/v1/docs/{self.owner_doc['id']}",
            json={"title": "Viewer Edit Attempt"},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_delete_doc(self):
        resp = await self.async_client.delete(
            f"/api/v1/docs/{self.owner_doc['id']}",
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_add_comment(self):
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.owner_doc['id']}/comments",
            json={"content": "Viewer comment"},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_restore_version(self):
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.owner_doc['id']}/versions/1/restore",
            headers=self.viewer_headers,
        )
        assert resp.status_code in (403, 404), resp.text

    async def test_viewer_cannot_export_doc(self):
        """Viewers should not be able to export documents."""
        resp = await self.async_client.get(
            f"/api/v1/docs/{self.owner_doc['id']}/export/md",
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_create_share(self):
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.owner_doc['id']}/shares",
            json={"access_level": "anyone"},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_manage_members(self):
        another = await _make_user(self.async_db, username="perm_v_another", email="perm_v_another@ex.com")
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/members",
            json={"user_id": str(another.id), "role": "viewer"},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_viewer_cannot_update_kb_settings(self):
        resp = await self.async_client.put(
            f"/api/v1/kb/{self.test_kb.id}",
            json={"name": "Viewer Rename Attempt"},
            headers=self.viewer_headers,
        )
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Editor permissions
# ---------------------------------------------------------------------------

class TestEditorPermissions:
    """Editor can CRUD their own docs, view history, export; cannot manage KB."""

    @pytest.fixture(autouse=True)
    async def setup(self, async_client, test_user, test_kb, async_db, auth_headers):
        self.async_client = async_client
        self.test_kb = test_kb
        self.async_db = async_db

        self.editor = await _make_user(async_db, username="perm_editor", email="perm_editor@ex.com")
        self.member = await _add_member(async_db, test_kb.id, self.editor.id, "editor")
        self.editor_headers = await auth_headers(self.editor)

        self.owner_headers = await auth_headers(test_user)
        self.owner_doc = await _create_doc_direct(async_client, test_kb.id, self.owner_headers, "Owner Doc for Editor Tests")
        self.editor_doc = await _create_doc_direct(async_client, test_kb.id, self.editor_headers, "Editor Own Doc")

    async def test_editor_can_create_doc(self):
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/docs",
            json={"title": "Editor Creates", "content_md": ""},
            headers=self.editor_headers,
        )
        assert resp.status_code == 201, resp.text

    async def test_editor_can_edit_own_doc(self):
        resp = await self.async_client.put(
            f"/api/v1/docs/{self.editor_doc['id']}",
            json={"title": "Editor Updated"},
            headers=self.editor_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_editor_cannot_edit_others_doc(self):
        resp = await self.async_client.put(
            f"/api/v1/docs/{self.owner_doc['id']}",
            json={"title": "Editor Hijack Attempt"},
            headers=self.editor_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_editor_cannot_delete_others_doc(self):
        resp = await self.async_client.delete(
            f"/api/v1/docs/{self.owner_doc['id']}",
            headers=self.editor_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_editor_can_view_versions(self):
        resp = await self.async_client.get(
            f"/api/v1/docs/{self.editor_doc['id']}/versions",
            headers=self.editor_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_editor_can_restore_version(self):
        """Editor can restore their own document's version (if one exists)."""
        # Create a version first via manual save
        await self.async_client.put(
            f"/api/v1/docs/{self.editor_doc['id']}",
            json={"content_md": "# v1", "is_manual_save": True},
            headers=self.editor_headers,
        )
        versions_resp = await self.async_client.get(
            f"/api/v1/docs/{self.editor_doc['id']}/versions",
            headers=self.editor_headers,
        )
        versions = versions_resp.json()["data"]
        if not versions:
            pytest.skip("No versions created to restore")

        version_id = versions[0]["id"]
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.editor_doc['id']}/versions/{version_id}/restore",
            headers=self.editor_headers,
        )
        assert resp.status_code in (200, 201), resp.text

    async def test_editor_can_export_doc(self):
        resp = await self.async_client.get(
            f"/api/v1/docs/{self.editor_doc['id']}/export/md",
            headers=self.editor_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_editor_can_share_doc(self):
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.editor_doc['id']}/shares",
            json={"access_level": "anyone"},
            headers=self.editor_headers,
        )
        assert resp.status_code in (200, 201), resp.text

    async def test_editor_can_add_comment(self):
        resp = await self.async_client.post(
            f"/api/v1/docs/{self.editor_doc['id']}/comments",
            json={"content": "Editor comment"},
            headers=self.editor_headers,
        )
        assert resp.status_code in (200, 201), resp.text

    async def test_editor_cannot_manage_members(self):
        another = await _make_user(self.async_db, username="perm_e_another", email="perm_e_another@ex.com")
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/members",
            json={"user_id": str(another.id), "role": "viewer"},
            headers=self.editor_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_editor_cannot_update_kb_settings(self):
        resp = await self.async_client.put(
            f"/api/v1/kb/{self.test_kb.id}",
            json={"name": "Editor Rename Attempt"},
            headers=self.editor_headers,
        )
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Admin permissions
# ---------------------------------------------------------------------------

class TestAdminPermissions:
    """Admin can manage content and members but cannot delete the KB itself."""

    @pytest.fixture(autouse=True)
    async def setup(self, async_client, test_user, test_kb, async_db, auth_headers):
        self.async_client = async_client
        self.test_kb = test_kb
        self.async_db = async_db

        self.admin_user = await _make_user(async_db, username="perm_admin", email="perm_admin@ex.com")
        await _add_member(async_db, test_kb.id, self.admin_user.id, "admin")
        self.admin_headers = await auth_headers(self.admin_user)

        self.owner_headers = await auth_headers(test_user)
        self.owner_doc = await _create_doc_direct(async_client, test_kb.id, self.owner_headers, "Owner Doc for Admin Tests")

    async def test_admin_can_edit_all_docs(self):
        resp = await self.async_client.put(
            f"/api/v1/docs/{self.owner_doc['id']}",
            json={"title": "Admin Edited"},
            headers=self.admin_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_admin_can_delete_all_docs(self):
        doc = await _create_doc_direct(
            self.async_client, self.test_kb.id, self.owner_headers, "Doc Admin Will Delete"
        )
        resp = await self.async_client.delete(
            f"/api/v1/docs/{doc['id']}",
            headers=self.admin_headers,
        )
        assert resp.status_code in (200, 204), resp.text

    async def test_admin_can_manage_members(self):
        invitee = await _make_user(self.async_db, username="perm_a_invitee", email="perm_a_invitee@ex.com")
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/members",
            json={"user_id": str(invitee.id), "role": "viewer"},
            headers=self.admin_headers,
        )
        assert resp.status_code == 201, resp.text

    async def test_admin_can_update_kb_settings(self):
        resp = await self.async_client.put(
            f"/api/v1/kb/{self.test_kb.id}",
            json={"description": "Admin updated description"},
            headers=self.admin_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_admin_cannot_delete_kb(self):
        """Admin role is NOT allowed to delete the knowledge base."""
        resp = await self.async_client.delete(
            f"/api/v1/kb/{self.test_kb.id}",
            headers=self.admin_headers,
        )
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Owner permissions
# ---------------------------------------------------------------------------

class TestOwnerPermissions:
    """Owner has unrestricted access to all KB operations."""

    @pytest.fixture(autouse=True)
    async def setup(self, async_client, test_user, test_kb, async_db, auth_headers):
        self.async_client = async_client
        self.test_kb = test_kb
        self.async_db = async_db
        self.owner_headers = await auth_headers(test_user)
        self.test_user = test_user

    async def test_owner_can_create_doc(self):
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/docs",
            json={"title": "Owner Doc", "content_md": ""},
            headers=self.owner_headers,
        )
        assert resp.status_code == 201, resp.text

    async def test_owner_can_edit_any_doc(self):
        doc = await _create_doc_direct(
            self.async_client, self.test_kb.id, self.owner_headers, "Edit Me"
        )
        resp = await self.async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"title": "Owner Edited"},
            headers=self.owner_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_owner_can_delete_any_doc(self):
        doc = await _create_doc_direct(
            self.async_client, self.test_kb.id, self.owner_headers, "Delete Me"
        )
        resp = await self.async_client.delete(
            f"/api/v1/docs/{doc['id']}",
            headers=self.owner_headers,
        )
        assert resp.status_code in (200, 204), resp.text

    async def test_owner_can_manage_members(self):
        invitee = await _make_user(self.async_db, username="perm_o_invitee", email="perm_o_invitee@ex.com")
        resp = await self.async_client.post(
            f"/api/v1/kb/{self.test_kb.id}/members",
            json={"user_id": str(invitee.id), "role": "editor"},
            headers=self.owner_headers,
        )
        assert resp.status_code == 201, resp.text

    async def test_owner_can_update_kb_settings(self):
        resp = await self.async_client.put(
            f"/api/v1/kb/{self.test_kb.id}",
            json={"description": "Owner updated"},
            headers=self.owner_headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_owner_can_delete_kb(self):
        """Owner is permitted to delete the KB (uses a separate temporary KB)."""
        create_resp = await self.async_client.post(
            "/api/v1/kb/",
            json={"name": "Owner Delete KB", "visibility": "private"},
            headers=self.owner_headers,
        )
        assert create_resp.status_code == 201, create_resp.text
        temp_kb_id = create_resp.json()["data"]["id"]

        resp = await self.async_client.delete(
            f"/api/v1/kb/{temp_kb_id}",
            headers=self.owner_headers,
        )
        assert resp.status_code in (200, 204), resp.text


# ---------------------------------------------------------------------------
# Non-member access
# ---------------------------------------------------------------------------

class TestNonMemberAccess:
    """Non-members cannot access private knowledge bases."""

    @pytest.fixture(autouse=True)
    async def setup(self, async_client, test_kb, async_db, auth_headers):
        self.async_client = async_client
        self.test_kb = test_kb
        self.outsider = await _make_user(async_db, username="outsider", email="outsider@ex.com")
        self.outsider_headers = await auth_headers(self.outsider)

    async def test_non_member_cannot_access_private_kb(self):
        resp = await self.async_client.get(
            f"/api/v1/kb/{self.test_kb.id}",
            headers=self.outsider_headers,
        )
        assert resp.status_code in (403, 404), resp.text

    async def test_non_member_cannot_list_docs(self):
        resp = await self.async_client.get(
            f"/api/v1/kb/{self.test_kb.id}/docs",
            headers=self.outsider_headers,
        )
        assert resp.status_code in (403, 404), resp.text

    async def test_unauthenticated_cannot_access_private_kb(self):
        resp = await self.async_client.get(f"/api/v1/kb/{self.test_kb.id}")
        assert resp.status_code == 401, resp.text
