"""Add tokens_tracked column to llm_traces.

Revision ID: 045_tokens_tracked
Revises: 044_email_preferences
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "045_tokens_tracked"
down_revision = "044_email_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_traces",
        sa.Column("tokens_tracked", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Mark all existing traces as already tracked so we don't re-count historical usage
    op.execute("UPDATE llm_traces SET tokens_tracked = true")


def downgrade() -> None:
    op.drop_column("llm_traces", "tokens_tracked")
