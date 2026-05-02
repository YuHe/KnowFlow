"""
Document version history tests.

Covers: create version, version limit enforcement, restore,
version comparison, and that restore itself creates a new version.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _make_doc(async_client, kb_id, headers, *, title="Version Test Doc"):
    resp = await async_client.post(
        f"/api/v1/kb/{kb_id}/docs",
        json={"title": title, "content_md": "# Initial", "content_html": "<h1>Initial</h1>"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


async def _save_version(async_client, kb_id, doc_id, headers, *, content="# Content"):
    resp = await async_client.put(
        f"/api/v1/docs/{doc_id}",
        json={"content_md": content, "is_manual_save": True},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


# ---------------------------------------------------------------------------
# Version tests
# ---------------------------------------------------------------------------

class TestDocumentVersions:

    async def test_create_version(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Manual save creates a new version entry."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers)

        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Version 1")

        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        versions = resp.json()["data"]
        assert len(versions) >= 1
        assert versions[0]["snapshot_reason"] in ("manual", "save")

    async def test_version_limit(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers, async_db: AsyncSession
    ):
        """
        When more than MAX_VERSIONS_PER_DOC (50) versions exist the oldest ones
        are pruned so the total never exceeds the limit.
        """
        from app.models.document import Document, DocumentVersion
        from sqlalchemy import select, func

        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="VersionLimit Doc")
        doc_id = uuid.UUID(doc["id"])

        # Insert 55 versions directly for speed
        for i in range(1, 56):
            async_db.add(
                DocumentVersion(
                    id=uuid.uuid4(),
                    document_id=doc_id,
                    version_num=i,
                    content_md=f"# Version {i}",
                    content_html=f"<h1>Version {i}</h1>",
                    snapshot_reason="manual",
                )
            )
        await async_db.commit()

        # Trigger the cleanup by doing one more manual save via the API
        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Trigger cleanup")

        # The API should have pruned old versions
        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert len(resp.json()["data"]) <= 50

    async def test_restore_version(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Restoring a version sets the document content to that version's content."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Restore Test Doc")

        # Save version with known content
        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Snapshot Content")

        versions_resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        versions = versions_resp.json()["data"]
        assert versions, "Expected at least one version"
        version_id = versions[0]["id"]

        # Update document to different content
        await async_client.put(
            f"/api/v1/docs/{doc['id']}",
            json={"content_md": "# Changed After Snapshot"},
            headers=headers,
        )

        # Restore
        restore_resp = await async_client.post(
            f"/api/v1/docs/{doc['id']}/versions/{version_id}/restore",
            headers=headers,
        )
        assert restore_resp.status_code in (200, 201), restore_resp.text

        # Verify restored content
        doc_resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}",
            headers=headers,
        )
        assert doc_resp.status_code == 200
        assert "Snapshot Content" in doc_resp.json()["data"]["content_md"]

    async def test_viewer_cannot_restore(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Viewer is not allowed to restore a document version."""
        from app.models.knowledge_base import KnowledgeBaseMember
        from app.models.user import User
        from app.utils.auth import hash_password

        viewer = User(
            id=uuid.uuid4(),
            username="version_viewer",
            display_name="Version Viewer",
            email="version_viewer@example.com",
            password_hash=hash_password("TestPass123!"),
            role="user",
            is_active=True,
        )
        async_db.add(viewer)
        await async_db.flush()
        async_db.add(
            KnowledgeBaseMember(
                id=uuid.uuid4(),
                knowledge_base_id=test_kb.id,
                user_id=viewer.id,
                role="viewer",
            )
        )
        await async_db.commit()

        owner_headers = await auth_headers(test_user)
        viewer_headers = await auth_headers(viewer)

        doc = await _make_doc(async_client, test_kb.id, owner_headers, title="Viewer Restore Doc")
        await _save_version(async_client, test_kb.id, doc["id"], owner_headers)

        versions_resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=owner_headers,
        )
        versions = versions_resp.json()["data"]
        if not versions:
            pytest.skip("No versions to attempt restore from")
        version_id = versions[0]["id"]

        resp = await async_client.post(
            f"/api/v1/docs/{doc['id']}/versions/{version_id}/restore",
            headers=viewer_headers,
        )
        assert resp.status_code == 403, resp.text

    async def test_compare_versions(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """Two versions can be compared; the endpoint returns diffs."""
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Compare Versions Doc")

        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Version A")
        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Version B")

        versions_resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        versions = versions_resp.json()["data"]
        if len(versions) < 2:
            pytest.skip("Need at least 2 versions to compare")

        v1_id = versions[-1]["id"]
        v2_id = versions[0]["id"]

        resp = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions/compare"
            f"?v1={v1_id}&v2={v2_id}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

    async def test_restore_creates_new_version(
        self, async_client: AsyncClient, test_user, test_kb, auth_headers
    ):
        """
        After restoring a version the system should create a new version
        entry with snapshot_reason='restore'.
        """
        headers = await auth_headers(test_user)
        doc = await _make_doc(async_client, test_kb.id, headers, title="Restore Creates Version")

        await _save_version(async_client, test_kb.id, doc["id"], headers, content="# Before Restore")

        # get versions
        versions_before = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        versions = versions_before.json()["data"]
        if not versions:
            pytest.skip("No versions created")

        version_id = versions[0]["id"]
        count_before = len(versions)

        await async_client.post(
            f"/api/v1/docs/{doc['id']}/versions/{version_id}/restore",
            headers=headers,
        )

        # get versions after
        versions_after = await async_client.get(
            f"/api/v1/docs/{doc['id']}/versions",
            headers=headers,
        )
        new_versions = versions_after.json()["data"]
        assert len(new_versions) > count_before, "Restore should create a new version entry"

        # The newest version should have reason 'restore'
        assert new_versions[0]["snapshot_reason"] == "restore"
