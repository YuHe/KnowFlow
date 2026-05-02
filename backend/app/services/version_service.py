from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings


async def create_version(
    db: AsyncSession,
    doc_id: uuid.UUID,
    content_md: str,
    content_html: str,
    user_id: uuid.UUID,
    reason: str = "manual",
) -> None:
    """
    Create a new DocumentVersion snapshot for the given document.

    - Computes the next version_num (max existing + 1).
    - If the total count exceeds MAX_VERSIONS_PER_DOC, deletes the oldest
      version(s) first to stay within the limit.
    - Does NOT commit; the caller is responsible for committing.
    """
    from app.models.document import DocumentVersion

    # Fetch existing version count and max version_num in a single query
    agg_result = await db.execute(
        select(
            func.count(DocumentVersion.id),
            func.max(DocumentVersion.version_num),
        ).where(DocumentVersion.document_id == doc_id)
    )
    count, max_num = agg_result.one()
    count = count or 0
    next_num = (max_num or 0) + 1

    # Prune oldest versions if we're at the limit
    max_versions = settings.MAX_VERSIONS_PER_DOC
    if count >= max_versions:
        excess = count - max_versions + 1  # make room for the new one
        oldest_result = await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc_id)
            .order_by(DocumentVersion.version_num.asc())
            .limit(excess)
        )
        for old_ver in oldest_result.scalars().all():
            await db.delete(old_ver)

    # Create the new version
    new_version = DocumentVersion(
        document_id=doc_id,
        version_num=next_num,
        content_md=content_md,
        content_html=content_html,
        snapshot_by=user_id,
        snapshot_reason=reason,
    )
    db.add(new_version)
    # flush so the object gets its id, but don't commit
    await db.flush()
