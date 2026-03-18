"""Add is_evicted flag to statements for soft eviction

Revision ID: 042_stmt_is_evicted
Revises: 041_cluster_cached_at
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "042_stmt_is_evicted"
down_revision = "041_cluster_cached_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "statements",
        sa.Column("is_evicted", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("statements", "is_evicted")
