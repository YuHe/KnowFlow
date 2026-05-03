from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.auth import UserOut


# ---------------------------------------------------------------------------
# Knowledge Base
# ---------------------------------------------------------------------------


class KbCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    icon: str = Field(default="📁", max_length=32)
    icon_url: Optional[str] = None
    visibility: str = Field(default="private", pattern="^(private|public)$")


class KbUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    icon: Optional[str] = Field(default=None, max_length=32)
    icon_url: Optional[str] = None
    visibility: Optional[str] = Field(default=None, pattern="^(private|public)$")


class KbOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None
    icon: str
    icon_url: Optional[str] = None
    visibility: str
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    doc_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------


class MemberOut(BaseModel):
    id: uuid.UUID
    knowledge_base_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    joined_at: datetime
    user: UserOut

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    user_id: Optional[uuid.UUID] = None
    email: Optional[str] = None
    role: str = Field(..., pattern="^(admin|editor|viewer)$")


class MemberUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|editor|viewer)$")
