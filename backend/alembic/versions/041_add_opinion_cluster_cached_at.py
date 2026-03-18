"""Add opinion_cluster_cached_at for TTL-based cache invalidation

Revision ID: 041_cluster_cached_at
Revises: 040_add_referral_tracking
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "041_cluster_cached_at"
down_revision = "040_add_referral_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "deliberations",
        sa.Column("opinion_cluster_cached_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("deliberations", "opinion_cluster_cached_at")
