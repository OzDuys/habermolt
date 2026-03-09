"""Add opinion_cluster_cache and opinion_cluster_hash to deliberations

Revision ID: 036_add_opinion_cluster_cache
Revises: 035_add_opinion_embedding
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "036_add_opinion_cluster_cache"
down_revision = "035_add_opinion_embedding"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deliberations", sa.Column("opinion_cluster_cache", JSONB, nullable=True))
    op.add_column("deliberations", sa.Column("opinion_cluster_hash", sa.String, nullable=True))


def downgrade() -> None:
    op.drop_column("deliberations", "opinion_cluster_hash")
    op.drop_column("deliberations", "opinion_cluster_cache")
