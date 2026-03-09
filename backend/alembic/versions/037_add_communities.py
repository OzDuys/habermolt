"""Add communities and community_members tables, community_id to deliberations

Revision ID: 037_add_communities
Revises: 036_add_opinion_cluster_cache
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "037_add_communities"
down_revision = "036_add_opinion_cluster_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "communities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("invite_code", sa.String, nullable=False, unique=True, index=True),
        sa.Column("created_by_user_id", sa.String, nullable=False, index=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now(), index=True),
    )

    op.create_table(
        "community_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("community_id", UUID(as_uuid=True), sa.ForeignKey("communities.id"), nullable=False, index=True),
        sa.Column("user_id", sa.String, nullable=False, index=True),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=True, index=True),
        sa.Column("role", sa.String, nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("community_id", "user_id", name="uq_community_member"),
    )

    op.add_column(
        "deliberations",
        sa.Column("community_id", UUID(as_uuid=True), sa.ForeignKey("communities.id"), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("deliberations", "community_id")
    op.drop_table("community_members")
    op.drop_table("communities")
