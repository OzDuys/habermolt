"""Unify hosted_agent_chat_sessions and topic_interview_sessions into agent_sessions

Revision ID: 028_unify_sessions
Revises: 027_chat_deliberation_id
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "028_unify_sessions"
down_revision = "027_chat_deliberation_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create the unified agent_sessions table
    op.create_table(
        "agent_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("deliberation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=True),
        sa.Column("session_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("messages", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_agent_sessions_agent_id", "agent_sessions", ["agent_id"])
    op.create_index("ix_agent_sessions_user_id", "agent_sessions", ["user_id"])
    op.create_index("ix_agent_sessions_deliberation_id", "agent_sessions", ["deliberation_id"])

    # 2. Migrate data from hosted_agent_chat_sessions
    #    Map hosted_agent_id -> agent_id via hosted_agents table
    op.execute("""
        INSERT INTO agent_sessions (id, agent_id, user_id, deliberation_id, session_type, status, topic, messages, created_at)
        SELECT
            cs.id,
            ha.agent_id,
            ha.user_id,
            cs.deliberation_id,
            CASE
                WHEN cs.deliberation_id IS NOT NULL THEN 'deliberation_chat'
                ELSE 'general'
            END,
            'active',
            cs.topic,
            cs.messages,
            cs.created_at
        FROM hosted_agent_chat_sessions cs
        JOIN hosted_agents ha ON ha.id = cs.hosted_agent_id
    """)

    # 3. Migrate data from topic_interview_sessions
    op.execute("""
        INSERT INTO agent_sessions (id, agent_id, user_id, deliberation_id, session_type, status, topic, messages, created_at)
        SELECT
            id,
            agent_id,
            user_id,
            deliberation_id,
            'deliberation_join',
            status,
            NULL,
            messages,
            created_at
        FROM topic_interview_sessions
    """)

    # 4. Drop old tables
    op.drop_table("topic_interview_sessions")
    op.drop_table("hosted_agent_chat_sessions")


def downgrade() -> None:
    # Recreate hosted_agent_chat_sessions
    op.create_table(
        "hosted_agent_chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hosted_agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("hosted_agents.id"), nullable=False),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("deliberation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=True),
        sa.Column("messages", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_hosted_agent_chat_sessions_hosted_agent_id", "hosted_agent_chat_sessions", ["hosted_agent_id"])
    op.create_index("ix_hosted_agent_chat_sessions_deliberation_id", "hosted_agent_chat_sessions", ["deliberation_id"])

    # Recreate topic_interview_sessions
    op.create_table(
        "topic_interview_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("deliberation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("messages", postgresql.JSONB()),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_topic_interview_sessions_agent_id", "topic_interview_sessions", ["agent_id"])
    op.create_index("ix_topic_interview_sessions_deliberation_id", "topic_interview_sessions", ["deliberation_id"])
    op.create_index("ix_topic_interview_sessions_user_id", "topic_interview_sessions", ["user_id"])

    # Migrate data back to hosted_agent_chat_sessions
    op.execute("""
        INSERT INTO hosted_agent_chat_sessions (id, hosted_agent_id, topic, deliberation_id, messages, created_at)
        SELECT
            s.id,
            ha.id,
            s.topic,
            s.deliberation_id,
            s.messages,
            s.created_at
        FROM agent_sessions s
        JOIN hosted_agents ha ON ha.agent_id = s.agent_id
        WHERE s.session_type IN ('general', 'deliberation_chat')
    """)

    # Migrate data back to topic_interview_sessions
    op.execute("""
        INSERT INTO topic_interview_sessions (id, agent_id, deliberation_id, user_id, messages, status, created_at)
        SELECT
            id,
            agent_id,
            deliberation_id,
            user_id,
            messages,
            status,
            created_at
        FROM agent_sessions
        WHERE session_type = 'deliberation_join'
    """)

    # Drop agent_sessions
    op.drop_table("agent_sessions")
