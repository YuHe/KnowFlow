from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
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


class DocumentTemplate(Base):
    """Defined before Document to avoid forward-ref issues."""

    __tablename__ = "document_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_md: Mapped[str] = mapped_column(Text, nullable=False)
    content_html: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_builtin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    creator: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[created_by], lazy="select"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="template", lazy="select"
    )


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="CASCADE"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    knowledge_base: Mapped["app.models.knowledge_base.KnowledgeBase"] = relationship(
        "KnowledgeBase", back_populates="sections", lazy="select"
    )
    parent: Mapped["Section | None"] = relationship(
        "Section",
        back_populates="children",
        remote_side="Section.id",
        foreign_keys=[parent_id],
        lazy="select",
    )
    children: Mapped[list["Section"]] = relationship(
        "Section",
        back_populates="parent",
        foreign_keys=[parent_id],
        cascade="all, delete-orphan",
        lazy="select",
    )
    creator: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[created_by], lazy="select"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="section", lazy="select"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content_md: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    content_html: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    word_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
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

    knowledge_base: Mapped["app.models.knowledge_base.KnowledgeBase"] = relationship(
        "KnowledgeBase", back_populates="documents", lazy="select"
    )
    section: Mapped["Section | None"] = relationship(
        "Section", back_populates="documents", lazy="select"
    )
    parent: Mapped["Document | None"] = relationship(
        "Document",
        back_populates="children",
        remote_side="Document.id",
        foreign_keys="Document.parent_id",
        lazy="select",
    )
    children: Mapped[list["Document"]] = relationship(
        "Document",
        back_populates="parent",
        foreign_keys="Document.parent_id",
        cascade="all, delete-orphan",
        lazy="select",
    )
    template: Mapped["DocumentTemplate | None"] = relationship(
        "DocumentTemplate", back_populates="documents", lazy="select"
    )
    creator: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[created_by], lazy="select"
    )
    updater: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[updated_by], lazy="select"
    )
    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )
    comments: Mapped[list["DocumentComment"]] = relationship(
        "DocumentComment",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )
    favorites: Mapped[list["DocumentFavorite"]] = relationship(
        "DocumentFavorite",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )
    shares: Mapped[list["DocumentShare"]] = relationship(
        "DocumentShare",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )
    cards: Mapped[list["Card"]] = relationship(
        "Card",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )
    assets: Mapped[list["Asset"]] = relationship(
        "Asset",
        back_populates="document",
        lazy="select",
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_num: Mapped[int] = mapped_column(Integer, nullable=False)
    content_md: Mapped[str] = mapped_column(Text, nullable=False)
    content_html: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    snapshot_reason: Mapped[str] = mapped_column(
        String(64), nullable=False, default="manual", server_default="manual"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("document_id", "version_num", name="uq_doc_version_num"),
    )

    document: Mapped["Document"] = relationship(
        "Document", back_populates="versions", lazy="select"
    )
    snapshotter: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[snapshot_by], lazy="select"
    )


class DocumentComment(Base):
    __tablename__ = "document_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    document: Mapped["Document"] = relationship(
        "Document", back_populates="comments", lazy="select"
    )
    user: Mapped["app.models.user.User"] = relationship(
        "User", foreign_keys=[user_id], lazy="select"
    )
    parent: Mapped["DocumentComment | None"] = relationship(
        "DocumentComment",
        back_populates="replies",
        remote_side="DocumentComment.id",
        foreign_keys=[parent_id],
        lazy="select",
    )
    replies: Mapped[list["DocumentComment"]] = relationship(
        "DocumentComment",
        back_populates="parent",
        foreign_keys=[parent_id],
        cascade="all, delete-orphan",
        lazy="select",
    )


class DocumentFavorite(Base):
    __tablename__ = "document_favorites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "document_id", name="uq_doc_favorite"),
    )

    user: Mapped["app.models.user.User"] = relationship(
        "User", foreign_keys=[user_id], lazy="select"
    )
    document: Mapped["Document"] = relationship(
        "Document", back_populates="favorites", lazy="select"
    )


class DocumentShare(Base):
    __tablename__ = "document_shares"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    share_code: Mapped[str] = mapped_column(
        String(16), unique=True, nullable=False, index=True
    )
    access_level: Mapped[str] = mapped_column(
        String(16), nullable=False, default="anyone", server_default="anyone"
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "access_level IN ('anyone', 'members_only')",
            name="ck_share_access_level",
        ),
    )

    document: Mapped["Document"] = relationship(
        "Document", back_populates="shares", lazy="select"
    )
    creator: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[created_by], lazy="select"
    )


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content_md: Mapped[str] = mapped_column(Text, nullable=False)
    content_html: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
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

    document: Mapped["Document"] = relationship(
        "Document", back_populates="cards", lazy="select"
    )


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    knowledge_base_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_bases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploader_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utcnow,
        server_default=func.now(),
    )

    knowledge_base: Mapped["app.models.knowledge_base.KnowledgeBase"] = relationship(
        "KnowledgeBase", back_populates="assets", lazy="select"
    )
    document: Mapped["Document | None"] = relationship(
        "Document", back_populates="assets", lazy="select"
    )
    uploader: Mapped["app.models.user.User | None"] = relationship(
        "User", foreign_keys=[uploader_id], lazy="select"
    )


# Fix forward references
import app.models.user  # noqa: E402, F401
import app.models.knowledge_base  # noqa: E402, F401
