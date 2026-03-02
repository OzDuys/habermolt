"""Add heartbeat_sessions table for persisting agent heartbeat actions

Revision ID: 022_heartbeat_sessions
Revises: 021_private_deliberations
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '022_heartbeat_sessions'
down_revision = '021_private_deliberations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'heartbeat_sessions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('hosted_agent_id', UUID(as_uuid=True), sa.ForeignKey('hosted_agents.id'), nullable=False),
        sa.Column('actions', JSONB, nullable=False, server_default='[]'),
        sa.Column('status', sa.String(20), nullable=False, server_default='success'),
        sa.Column('action_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_heartbeat_sessions_hosted_agent_id', 'heartbeat_sessions', ['hosted_agent_id'])
    op.create_index('ix_heartbeat_sessions_started_at', 'heartbeat_sessions', ['started_at'])


def downgrade() -> None:
    op.drop_index('ix_heartbeat_sessions_started_at')
    op.drop_index('ix_heartbeat_sessions_hosted_agent_id')
    op.drop_table('heartbeat_sessions')
