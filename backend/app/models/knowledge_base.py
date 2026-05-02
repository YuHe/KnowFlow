from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str] = mapped_column(
        String(32), nullable=False, default="📁", server_default="📁"
    )
    visibility: Mapped[str] = mapped_column(
        String(16), nullable=False, default="private", server_default="private"
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        onupdate=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private', 'public')", name="ck_kb_visibility"
        ),
    )

    # relationships
    owner: Mapped["app.models.user.User"] = relationship(
        "User",
        back_populates="owned_knowledge_bases",
        foreign_keys=[owner_id],
        lazy="select",
    )
    members: Mapped[list["KnowledgeBaseMember"]] = relationship(
        "KnowledgeBaseMember",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
        lazy="select",
    )
    sections: Mapped[list] = relationship(
        "Section",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
        lazy="select",
    )
    documents: Mapped[list] = relationship(
        "Document",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
        lazy="select",
    )
    assets: Mapped[list] = relationship(
        "Asset",
        back_populates="knowledge_base",
        cascade="all, delete-orphan",
        lazy="select",
    )


class KnowledgeBaseMember(Base):
    __tablename__ = "knowledge_base_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('owner', 'admin', 'editor', 'viewer')",
            name="ck_kb_member_role",
        ),
        UniqueConstraint("knowledge_base_id", "user_id", name="uq_kb_member"),
    )

    # relationships
    knowledge_base: Mapped["KnowledgeBase"] = relationship(
        "KnowledgeBase", back_populates="members", lazy="select"
    )
    user: Mapped["app.models.user.User"] = relationship(
        "User",
        back_populates="knowledge_base_memberships",
        foreign_keys=[user_id],
        lazy="select",
    )
    inviter: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[invited_by], lazy="select"
    )


# Fix forward reference
import app.models.user  # noqa: E402, F401
