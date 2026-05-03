"""add icon_url to knowledge_bases

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-03 00:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'knowledge_bases',
        sa.Column('icon_url', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('knowledge_bases', 'icon_url')
