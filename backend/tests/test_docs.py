"""
Document CRUD, versioning trigger, export and move tests.
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


async def _make_doc(
    async_client: AsyncClient,
    kb_id,
    headers: dict,
    *,
    title: str = "Test Document",
    content_md: str = "# Hello",
):
    resp = await async_client.post(
        f"/api/v1/kb/{kb_id}/docs",
        json={"title": title, "content_md": content_md, "content_html": f"<h1>{title}</h1>"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


# ---------------------------------------------------------------------------
# Document CRUD
# ---------------------------------------------------------------------------

class TestDocumentCrud:

    async def test_create_doc(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Owner can create a document inside a KB."""
        headers = await auth_headers(test_user)
        resp = await async_client.post(
            f"/api/v1/kb/{test_kb.id}/docs",
            json={
                "title": "My First Doc",
                "content_md": "# Introduction",
                "content_html": "<h1>Introduction</h1>",
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["title"] == "My First Doc"
        assert data["knowledge_base_id"] == str(test_kb.id)

    async def test_get_doc(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Can retrieve a document by ID."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers)

        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["id"] == doc["id"]

    async def test_update_doc(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Owner can update a document's title and content."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers)

        resp = await async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"title": "Updated Title", "content_md": "# Updated"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["title"] == "Updated Title"

    async def test_update_creates_version_on_manual_save(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Passing save_version=true should create a new document version."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Versioned Doc")

        resp = await async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"content_md": "# Version 1", "is_manual_save": True},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        versions_resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        assert versions_resp.status_code == 200, versions_resp.text
        assert len(versions_resp.json()["data"]) >= 1

    async def test_update_no_version_on_autosave(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Autosave (save_version=false or absent) must NOT create a version."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Autosave Doc")

        # First: check baseline version count
        versions_before = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        count_before = len(versions_before.json()["data"])

        # Autosave (no is_manual_save flag or false)
        await async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"content_md": "# Autosaved", "is_manual_save": False},
            headers=headers,
        )

        versions_after = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        count_after = len(versions_after.json()["data"])
        assert count_after == count_before

    async def test_delete_doc(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Owner can delete a document."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Delete Me Doc")

        resp = await async_client.delete(
            f"/api/v1/docs/{doc['id']}",
            headers=headers,
        )
        assert resp.status_code in (200, 204), resp.text

    async def test_editor_can_only_delete_own_doc(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """
        An editor-role member can delete their OWN document
        but NOT another user's document (should return 403).
        """
        from app.models.knowledge_base import KnowledgeBaseMember

        # Create editor user and add to KB
        editor = await _make_user(async_db, username="editordel", email="editordel@example.com")
        async_db.add(
            KnowledgeBaseMember(
                id=uuid.uuid4(),
                knowledge_base_id=test_kb.id,
                user_id=editor.id,
                role="editor",
            )
        )
        await async_db.commit()

        owner_headers = await auth_headers(test_user)
        editor_headers = await auth_headers(editor)

        # Owner creates a doc
        owner_doc = await _make_doc(async_client, test_kb.id, owner_headers, title="Owner Doc")

        # Editor should NOT be able to delete owner's doc
        resp = await async_client.delete(
            f"/api/v1/docs/{owner_doc['id']}",
            headers=editor_headers,
        )
        assert resp.status_code == 403, resp.text

        # Editor creates own doc and CAN delete it
        editor_doc = await _make_doc(async_client, test_kb.id, editor_headers, title="Editor Own Doc")
        resp = await async_client.delete(
            f"/api/v1/docs/{editor_doc['id']}",
            headers=editor_headers,
        )
        assert resp.status_code in (200, 204), resp.text

    async def test_viewer_cannot_create_doc(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """A viewer member cannot create documents."""
        from app.models.knowledge_base import KnowledgeBaseMember

        viewer = await _make_user(async_db, username="viewerdoc", email="viewerdoc@example.com")
        async_db.add(
            KnowledgeBaseMember(
                id=uuid.uuid4(),
                knowledge_base_id=test_kb.id,
                user_id=viewer.id,
                role="viewer",
            )
        )
        await async_db.commit()

        viewer_headers = await auth_headers(viewer)
        resp = await async_client.post(
            f"/api/v1/kb/{test_kb.id}/docs",
            json={"title": "Viewer Doc Attempt", "content_md": ""},
            headers=viewer_headers,
        )
        assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

class TestDocumentExport:

    async def test_export_md(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Markdown export returns text/markdown content."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(
            async_client,
            test_kb.id,
            headers,
            title="Export MD Doc",
            content_md="# Export\nHello World",
        )
        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/export/md",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        content_type = resp.headers.get("content-type", "")
        assert "text" in content_type or "markdown" in content_type or "octet-stream" in content_type

    async def test_export_docx(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """DOCX export returns a binary Word document."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(
            async_client,
            test_kb.id,
            headers,
            title="Export DOCX Doc",
            content_md="# Export\nHello World",
        )
        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/export/docx",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        content_type = resp.headers.get("content-type", "")
        assert "word" in content_type or "octet-stream" in content_type or "zip" in content_type


# ---------------------------------------------------------------------------
# Move
# ---------------------------------------------------------------------------

class TestDocumentMove:

    async def test_move_doc(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers, async_db
    ):
        """Editor can move a document to a different section."""
        from app.models.document import Section

        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Movable Doc")

        # Create a target section
        section = Section(
            id=uuid.uuid4(),
            knowledge_base_id=test_kb.id,
            title="Target Section",
            sort_order=0,
        )
        async_db.add(section)
        await async_db.commit()

        resp = await async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"section_id": str(section.id)},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["section_id"] == str(section.id)
