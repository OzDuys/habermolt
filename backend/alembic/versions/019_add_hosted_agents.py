"""Add hosted agents, interview sessions, and notifications tables

Supports platform-managed agents for non-technical users with
interview system, token usage tracking, and in-app notifications.

Revision ID: 019_hosted_agents
Revises: 018_ack_feedback
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '019_hosted_agents'
down_revision = '018_ack_feedback'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # hosted_agents
    op.create_table(
        'hosted_agents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False, unique=True),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=False, unique=True),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column('user_profile', JSONB, nullable=True),
        sa.Column('profile_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_interviewed_at', sa.DateTime(), nullable=True),
        sa.Column('model', sa.String(), nullable=False, server_default='google/gemini-2.5-flash'),
        sa.Column('participation_frequency', sa.String(), nullable=False, server_default='daily'),
        sa.Column('pricing_tier', sa.String(), nullable=False, server_default='free'),
        sa.Column('byok_api_key_encrypted', sa.String(), nullable=True),
        sa.Column('tokens_used_period', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('billing_period_start', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('paused_reason', sa.String(), nullable=True),
        sa.Column('last_heartbeat_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_hosted_agents_user_id', 'hosted_agents', ['user_id'])

    # hosted_agent_interview_sessions
    op.create_table(
        'hosted_agent_interview_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('hosted_agent_id', UUID(as_uuid=True), sa.ForeignKey('hosted_agents.id'), nullable=False),
        sa.Column('topic', sa.String(), nullable=True),
        sa.Column('messages', JSONB, nullable=False, server_default='[]'),
        sa.Column('is_complete', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_interview_sessions_hosted_agent_id', 'hosted_agent_interview_sessions', ['hosted_agent_id'])

    # notifications
    op.create_table(
        'notifications',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.String(), nullable=False),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('read_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_type', 'notifications', ['type'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])

    # Add hosted_agent_id to llm_traces
    op.add_column('llm_traces', sa.Column('hosted_agent_id', UUID(as_uuid=True), sa.ForeignKey('hosted_agents.id'), nullable=True))
    op.create_index('ix_llm_traces_hosted_agent_id', 'llm_traces', ['hosted_agent_id'])


def downgrade() -> None:
    op.drop_index('ix_llm_traces_hosted_agent_id', 'llm_traces')
    op.drop_column('llm_traces', 'hosted_agent_id')
    op.drop_table('notifications')
    op.drop_table('hosted_agent_interview_sessions')
    op.drop_table('hosted_agents')
