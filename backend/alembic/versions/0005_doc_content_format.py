"""add documents.content_format

Distinguishes a rich-text document (TipTap; content_md and content_html are two
projections of one ProseMirror doc and round-trip on every save) from a
standalone HTML document such as an LLM-generated report, whose content_html is
authoritative and must never go through the markdown round trip.

Existing rows get "richtext", so their behaviour is unchanged.

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column(
            "content_format",
            sa.String(length=16),
            nullable=False,
            server_default="richtext",
        ),
    )


def downgrade() -> None:
    op.drop_column("documents", "content_format")
