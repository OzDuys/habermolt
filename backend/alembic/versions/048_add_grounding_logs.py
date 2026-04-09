"""Add grounding_logs table for human grounding audit trail

Revision ID: 048_grounding_logs
Revises: 047_ranking_snapshots
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "048_grounding_logs"
down_revision = "047_ranking_snapshots"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "grounding_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False, index=True),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("hosted_agent_id", UUID(as_uuid=True), sa.ForeignKey("hosted_agents.id"), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False, index=True),
        sa.Column("notification_id", UUID(as_uuid=True), sa.ForeignKey("notifications.id"), nullable=True),
        sa.Column("deliberation_id", UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=True),
        sa.Column("opinion_id", UUID(as_uuid=True), sa.ForeignKey("opinions.id"), nullable=True),
        sa.Column("input_text", sa.Text(), nullable=True),
        sa.Column("output_text", sa.Text(), nullable=True),
        sa.Column("opinion_text_before", sa.Text(), nullable=True),
        sa.Column("opinion_text_after", sa.Text(), nullable=True),
        sa.Column("profile_version_before", sa.Integer(), nullable=True),
        sa.Column("profile_version_after", sa.Integer(), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, index=True),
    )


def downgrade():
    op.drop_table("grounding_logs")
