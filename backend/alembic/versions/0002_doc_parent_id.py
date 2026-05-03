"""add parent_id to documents for hierarchical docs

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-03 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'documents',
        sa.Column(
            'parent_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('documents.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.create_index('ix_documents_parent_id', 'documents', ['parent_id'])


def downgrade() -> None:
    op.drop_index('ix_documents_parent_id', table_name='documents')
    op.drop_column('documents', 'parent_id')
