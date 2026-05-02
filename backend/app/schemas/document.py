from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.auth import UserOut


# ---------------------------------------------------------------------------
# Section
# ---------------------------------------------------------------------------


class SectionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    parent_id: Optional[uuid.UUID] = None
    sort_order: int = 0


class SectionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    parent_id: Optional[uuid.UUID] = None
    sort_order: Optional[int] = None


class SectionOut(BaseModel):
    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    title: str
    sort_order: int
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SectionReorderItem(BaseModel):
    id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    sort_order: int


class SectionReorder(BaseModel):
    items: list[SectionReorderItem]


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class DocCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    content_md: str = ""
    content_html: str = ""
    section_id: Optional[uuid.UUID] = None
    template_id: Optional[uuid.UUID] = None
    sort_order: int = 0


class DocUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=512)
    content_md: Optional[str] = None
    content_html: Optional[str] = None
    section_id: Optional[uuid.UUID] = None
    is_public: Optional[bool] = None
    word_count: Optional[int] = None
    sort_order: Optional[int] = None


class DocOut(BaseModel):
    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    section_id: Optional[uuid.UUID] = None
    sort_order: int
    title: str
    content_md: str
    content_html: str
    is_public: bool
    template_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    updated_by: Optional[uuid.UUID] = None
    word_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocListItem(BaseModel):
    id: uuid.UUID
    title: str
    section_id: Optional[uuid.UUID] = None
    sort_order: int
    created_by: Optional[uuid.UUID] = None
    updated_by: Optional[uuid.UUID] = None
    word_count: int
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Document Versions
# ---------------------------------------------------------------------------


class VersionOut(BaseModel):
    id: uuid.UUID
    version_num: int
    snapshot_by: Optional[uuid.UUID] = None
    snapshot_reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionDetail(VersionOut):
    content_md: str
    content_html: str


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    parent_id: Optional[uuid.UUID] = None


class CommentOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    content: str
    parent_id: Optional[uuid.UUID] = None
    created_at: datetime
    user: UserOut

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------


class FavoriteOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    doc_title: str
    kb_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    content_md: str
    content_html: str = ""
    category: Optional[str] = Field(default=None, max_length=64)


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    content_md: str
    content_html: str
    category: Optional[str] = None
    is_builtin: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Shares
# ---------------------------------------------------------------------------


class ShareCreate(BaseModel):
    access_level: str = Field(
        default="anyone", pattern="^(anyone|members_only)$"
    )
    expires_at: Optional[datetime] = None
    password: Optional[str] = None


class ShareUpdate(BaseModel):
    access_level: Optional[str] = Field(
        default=None, pattern="^(anyone|members_only)$"
    )
    expires_at: Optional[datetime] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


class ShareOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    share_code: str
    access_level: str
    expires_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------


class CardCreate(BaseModel):
    content_md: str
    content_html: str = ""
    order_index: int = 0


class CardUpdate(BaseModel):
    content_md: Optional[str] = None
    content_html: Optional[str] = None
    order_index: Optional[int] = None


class CardOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    content_md: str
    content_html: str
    order_index: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
