"""Add profile_snapshots table for hosted-agent profile edit history

Revision ID: 052_profile_snapshots
Revises: 051_review_nudge_sent_at
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "052_profile_snapshots"
down_revision = "051_review_nudge_sent_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "hosted_agent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("hosted_agents.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("profile_markdown", sa.Text(), nullable=False),
        sa.Column("profile_version", sa.Integer(), nullable=False),
        sa.Column("trigger", sa.String(40), nullable=False),
        sa.Column("source_type", sa.String(40), nullable=True),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_profile_snapshots_agent_created",
        "profile_snapshots",
        ["hosted_agent_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_profile_snapshots_agent_created", table_name="profile_snapshots")
    op.drop_table("profile_snapshots")
