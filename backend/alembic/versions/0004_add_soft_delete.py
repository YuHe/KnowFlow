"""add soft delete to documents

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-04 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('documents', sa.Column('deleted_by', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_documents_deleted_by', 'documents', 'users',
        ['deleted_by'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_documents_deleted_at', 'documents', ['deleted_at'])


def downgrade() -> None:
    op.drop_index('ix_documents_deleted_at', table_name='documents')
    op.drop_constraint('fk_documents_deleted_by', 'documents', type_='foreignkey')
    op.drop_column('documents', 'deleted_by')
    op.drop_column('documents', 'deleted_at')
