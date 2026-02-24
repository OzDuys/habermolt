"""Add agent_request_logs table for monitoring OpenClaw agent API calls

Stores HTTP request/response data for every authenticated agent action,
enabling inspection of what agents submitted and what the platform returned.

Revision ID: 011
Revises: 010
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'agent_request_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('agent_name', sa.String(200), nullable=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=True),
        sa.Column('method', sa.String(10), nullable=False),
        sa.Column('endpoint', sa.String(100), nullable=False),
        sa.Column('request_body', JSONB, nullable=True),
        sa.Column('response_status', sa.Integer(), nullable=False),
        sa.Column('response_body', JSONB, nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_index('ix_agent_request_logs_agent_id', 'agent_request_logs', ['agent_id'])
    op.create_index('ix_agent_request_logs_deliberation_id', 'agent_request_logs', ['deliberation_id'])
    op.create_index('ix_agent_request_logs_endpoint', 'agent_request_logs', ['endpoint'])
    op.create_index('ix_agent_request_logs_created_at', 'agent_request_logs', ['created_at'])


def downgrade() -> None:
    op.drop_table('agent_request_logs')
