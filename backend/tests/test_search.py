"""
Search endpoint tests.

Covers: search by title, search by content, access-control filtering.
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


async def _make_kb(async_db: AsyncSession, owner_id, *, name: str, slug: str, visibility: str = "private"):
    from app.models.knowledge_base import KnowledgeBase, KnowledgeBaseMember

    kb = KnowledgeBase(
        id=uuid.uuid4(),
        name=name,
        slug=slug,
        visibility=visibility,
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


async def _make_doc(async_db: AsyncSession, kb_id, created_by, *, title: str, content_md: str = ""):
    from app.models.document import Document

    doc = Document(
        id=uuid.uuid4(),
        knowledge_base_id=kb_id,
        title=title,
        content_md=content_md,
        content_html=f"<p>{content_md}</p>",
        created_by=created_by,
    )
    async_db.add(doc)
    await async_db.commit()
    await async_db.refresh(doc)
    return doc


# ---------------------------------------------------------------------------
# Search tests
# ---------------------------------------------------------------------------

class TestSearch:

    async def test_search_by_title(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Full-text search finds documents whose title matches the query."""
        await _make_doc(
            async_db,
            test_kb.id,
            test_user.id,
            title="Unique Findable Title XYZ999",
            content_md="Some random content",
        )
        headers = await auth_headers(test_user)
        resp = await async_client.get(
            "/api/v1/search",
            params={"q": "Unique Findable Title XYZ999"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["data"]
        titles = [r.get("title", "") for r in (results if isinstance(results, list) else results.get("items", []))]
        assert any("XYZ999" in t for t in titles), f"Expected search hit, got: {titles}"

    async def test_search_by_content(
        self, async_client: AsyncClient, test_user, test_kb, async_db, auth_headers
    ):
        """Search also looks inside document content (content_md)."""
        await _make_doc(
            async_db,
            test_kb.id,
            test_user.id,
            title="Content Search Doc",
            content_md="This document contains the keyword UNIQUECONTENTABC123",
        )
        headers = await auth_headers(test_user)
        resp = await async_client.get(
            "/api/v1/search",
            params={"q": "UNIQUECONTENTABC123"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["data"]
        items = results if isinstance(results, list) else results.get("items", [])
        assert len(items) >= 1, "Expected at least one content-based search hit"

    async def test_search_respects_kb_access(
        self, async_client: AsyncClient, test_user, async_db, auth_headers
    ):
        """
        Search results must NOT include documents from knowledge bases
        the requesting user is not a member of.
        """
        # Create a second user who owns a private KB with a unique doc
        other_user = await _make_user(async_db, username="searchother", email="searchother@example.com")
        private_kb = await _make_kb(
            async_db,
            other_user.id,
            name="Other Private KB",
            slug="other-private-kb-search",
            visibility="private",
        )
        await _make_doc(
            async_db,
            private_kb.id,
            other_user.id,
            title="Secret Doc HIDDENTERM9876",
            content_md="Super secret content HIDDENTERM9876",
        )

        # test_user is NOT a member of other_user's KB
        headers = await auth_headers(test_user)
        resp = await async_client.get(
            "/api/v1/search",
            params={"q": "HIDDENTERM9876"},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        results = resp.json()["data"]
        items = results if isinstance(results, list) else results.get("items", [])
        titles = [r.get("title", "") for r in items]
        assert not any("HIDDENTERM9876" in t for t in titles), (
            f"Private KB document should not appear in search results. Got: {titles}"
        )
