"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from __future__ import annotations

import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('username', sa.String(64), unique=True, nullable=False),
        sa.Column('display_name', sa.String(128), nullable=False),
        sa.Column('email', sa.String(255), unique=True, nullable=False),
        sa.Column('password_hash', sa.Text, nullable=False),
        sa.Column('avatar_url', sa.Text, nullable=True),
        sa.Column('role', sa.String(16), nullable=False, server_default='user'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user', 'super_admin')", name='ck_users_role'),
    )
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email', 'users', ['email'])

    # ── document_templates ─────────────────────────────────────────────────────
    op.create_table(
        'document_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('content_md', sa.Text, nullable=False),
        sa.Column('content_html', sa.Text, nullable=False, server_default=''),
        sa.Column('category', sa.String(64), nullable=True),
        sa.Column('is_builtin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── knowledge_bases ────────────────────────────────────────────────────────
    op.create_table(
        'knowledge_bases',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('slug', sa.String(128), unique=True, nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('icon', sa.String(32), nullable=False, server_default='📁'),
        sa.Column('visibility', sa.String(16), nullable=False, server_default='private'),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("visibility IN ('private', 'public')", name='ck_kb_visibility'),
    )
    op.create_index('ix_knowledge_bases_slug', 'knowledge_bases', ['slug'])
    op.create_index('ix_knowledge_bases_owner_id', 'knowledge_bases', ['owner_id'])

    # ── knowledge_base_members ─────────────────────────────────────────────────
    op.create_table(
        'knowledge_base_members',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('knowledge_base_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('knowledge_bases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('owner', 'admin', 'editor', 'viewer')", name='ck_kb_member_role'),
        sa.UniqueConstraint('knowledge_base_id', 'user_id', name='uq_kb_member'),
    )
    op.create_index('ix_knowledge_base_members_kb_id', 'knowledge_base_members', ['knowledge_base_id'])
    op.create_index('ix_knowledge_base_members_user_id', 'knowledge_base_members', ['user_id'])

    # ── sections ───────────────────────────────────────────────────────────────
    op.create_table(
        'sections',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('knowledge_base_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('knowledge_bases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sections.id', ondelete='CASCADE'), nullable=True),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_sections_knowledge_base_id', 'sections', ['knowledge_base_id'])

    # ── documents ──────────────────────────────────────────────────────────────
    op.create_table(
        'documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('knowledge_base_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('knowledge_bases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('sections.id', ondelete='SET NULL'), nullable=True),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('content_md', sa.Text, nullable=False, server_default=''),
        sa.Column('content_html', sa.Text, nullable=False, server_default=''),
        sa.Column('is_public', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('document_templates.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('word_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_documents_knowledge_base_id', 'documents', ['knowledge_base_id'])
    op.create_index('ix_documents_section_id', 'documents', ['section_id'])

    # ── document_versions ──────────────────────────────────────────────────────
    op.create_table(
        'document_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version_num', sa.Integer, nullable=False),
        sa.Column('content_md', sa.Text, nullable=False),
        sa.Column('content_html', sa.Text, nullable=False),
        sa.Column('snapshot_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('snapshot_reason', sa.String(64), nullable=False, server_default='manual'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('document_id', 'version_num', name='uq_doc_version_num'),
    )
    op.create_index('ix_document_versions_document_id', 'document_versions', ['document_id'])

    # ── document_comments ──────────────────────────────────────────────────────
    op.create_table(
        'document_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('document_comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_document_comments_document_id', 'document_comments', ['document_id'])
    op.create_index('ix_document_comments_user_id', 'document_comments', ['user_id'])

    # ── document_favorites ─────────────────────────────────────────────────────
    op.create_table(
        'document_favorites',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'document_id', name='uq_doc_favorite'),
    )
    op.create_index('ix_document_favorites_user_id', 'document_favorites', ['user_id'])
    op.create_index('ix_document_favorites_document_id', 'document_favorites', ['document_id'])

    # ── document_shares ────────────────────────────────────────────────────────
    op.create_table(
        'document_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('share_code', sa.String(16), unique=True, nullable=False),
        sa.Column('access_level', sa.String(16), nullable=False, server_default='anyone'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('password_hash', sa.Text, nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("access_level IN ('anyone', 'members_only')", name='ck_share_access_level'),
    )
    op.create_index('ix_document_shares_document_id', 'document_shares', ['document_id'])
    op.create_index('ix_document_shares_share_code', 'document_shares', ['share_code'])

    # ── cards ──────────────────────────────────────────────────────────────────
    op.create_table(
        'cards',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content_md', sa.Text, nullable=False),
        sa.Column('content_html', sa.Text, nullable=False),
        sa.Column('order_index', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_cards_document_id', 'cards', ['document_id'])

    # ── assets ─────────────────────────────────────────────────────────────────
    op.create_table(
        'assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('knowledge_base_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('knowledge_bases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='SET NULL'), nullable=True),
        sa.Column('uploader_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('storage_path', sa.Text, nullable=False),
        sa.Column('url', sa.Text, nullable=False),
        sa.Column('mime_type', sa.String(64), nullable=False),
        sa.Column('size_bytes', sa.BigInteger, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_assets_knowledge_base_id', 'assets', ['knowledge_base_id'])
    op.create_index('ix_assets_document_id', 'assets', ['document_id'])


def downgrade() -> None:
    op.drop_table('assets')
    op.drop_table('cards')
    op.drop_table('document_shares')
    op.drop_table('document_favorites')
    op.drop_table('document_comments')
    op.drop_table('document_versions')
    op.drop_table('documents')
    op.drop_table('sections')
    op.drop_table('knowledge_base_members')
    op.drop_table('knowledge_bases')
    op.drop_table('document_templates')
    op.drop_table('users')
