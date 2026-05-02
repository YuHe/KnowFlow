from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.document import Document, DocumentVersion
from app.models.user import User
from app.utils.auth import get_current_active_user
from app.utils.permissions import ROLE_LEVELS, get_kb_member_role, require_kb_role
from app.utils.response import err, ok

router = APIRouter(tags=["versions"])


def _version_to_dict(v: DocumentVersion, include_content: bool = False) -> dict:
    d = {
        "id": str(v.id),
        "document_id": str(v.document_id),
        "version_num": v.version_num,
        "snapshot_reason": v.snapshot_reason,
        "snapshot_by": str(v.snapshot_by) if v.snapshot_by else None,
        "created_at": v.created_at.isoformat(),
    }
    if include_content:
        d["content_md"] = v.content_md
        d["content_html"] = v.content_html
    return d


async def _get_doc_and_check_access(
    doc_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    min_role: str = "viewer",
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if user.role != "super_admin":
        role = await get_kb_member_role(db, doc.knowledge_base_id, user.id)
        if not role:
            raise HTTPException(status_code=403, detail="Access denied")
        if ROLE_LEVELS.get(role, 0) < ROLE_LEVELS[min_role]:
            raise HTTPException(
                status_code=403,
                detail=f"Requires at least '{min_role}' role",
            )
    return doc


@router.get("/docs/{doc_id}/versions")
async def list_versions(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_doc_and_check_access(doc_id, current_user, db, "viewer")

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc_id)
        .order_by(DocumentVersion.version_num.desc())
    )
    versions = result.scalars().all()
    return ok([_version_to_dict(v) for v in versions])


@router.get("/docs/{doc_id}/versions/compare")
async def compare_versions(
    doc_id: uuid.UUID,
    v1: int,
    v2: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_doc_and_check_access(doc_id, current_user, db, "viewer")

    r1 = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc_id,
            DocumentVersion.version_num == v1,
        )
    )
    ver1 = r1.scalar_one_or_none()
    if not ver1:
        return err("VERSION_NOT_FOUND", f"Version {v1} not found.", 404)

    r2 = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc_id,
            DocumentVersion.version_num == v2,
        )
    )
    ver2 = r2.scalar_one_or_none()
    if not ver2:
        return err("VERSION_NOT_FOUND", f"Version {v2} not found.", 404)

    return ok(
        {
            "v1": _version_to_dict(ver1, include_content=True),
            "v2": _version_to_dict(ver2, include_content=True),
        }
    )


@router.get("/docs/{doc_id}/versions/{ver_id}")
async def get_version(
    doc_id: uuid.UUID,
    ver_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    await _get_doc_and_check_access(doc_id, current_user, db, "viewer")

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == ver_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return ok(_version_to_dict(version, include_content=True))


@router.post("/docs/{doc_id}/versions/{ver_id}/restore")
async def restore_version(
    doc_id: uuid.UUID,
    ver_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    doc = await _get_doc_and_check_access(doc_id, current_user, db, "editor")

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.id == ver_id,
            DocumentVersion.document_id == doc_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Save current state as a new version before restoring
    from app.services.version_service import create_version

    await create_version(
        db=db,
        doc_id=doc.id,
        content_md=doc.content_md,
        content_html=doc.content_html,
        user_id=current_user.id,
        reason="pre_restore",
    )

    doc.content_md = version.content_md
    doc.content_html = version.content_html
    doc.updated_by = current_user.id
    await db.flush()
    return ok({"message": f"Document restored to version {version.version_num}."})
