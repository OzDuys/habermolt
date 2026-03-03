"""Add deliberation_id to hosted_agent_chat_sessions

Revision ID: 027_chat_deliberation_id
Revises: 026_topic_interview_sessions
Create Date: 2026-03-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "027_chat_deliberation_id"
down_revision = "026_topic_interview_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hosted_agent_chat_sessions",
        sa.Column("deliberation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_sessions_deliberation_id",
        "hosted_agent_chat_sessions",
        "deliberations",
        ["deliberation_id"],
        ["id"],
    )
    op.create_index(
        "ix_hosted_agent_chat_sessions_deliberation_id",
        "hosted_agent_chat_sessions",
        ["deliberation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_hosted_agent_chat_sessions_deliberation_id", "hosted_agent_chat_sessions")
    op.drop_constraint("fk_chat_sessions_deliberation_id", "hosted_agent_chat_sessions", type_="foreignkey")
    op.drop_column("hosted_agent_chat_sessions", "deliberation_id")
