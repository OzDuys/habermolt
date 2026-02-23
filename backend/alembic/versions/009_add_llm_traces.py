"""Add llm_traces table for monitoring

Stores full input/output for every LLM API call, enabling
LangSmith-style trace inspection and debugging.

Revision ID: 009
Revises: 008
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'llm_traces',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=True),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=True),
        sa.Column('trace_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='success'),
        sa.Column('model', sa.String(200), nullable=False),
        sa.Column('provider', sa.String(100), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('input_messages', JSONB, nullable=False),
        sa.Column('output_text', sa.Text(), nullable=True),
        sa.Column('reasoning_text', sa.Text(), nullable=True),
        sa.Column('tokens_in', sa.Integer(), nullable=True),
        sa.Column('tokens_out', sa.Integer(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_index('ix_llm_traces_deliberation_id', 'llm_traces', ['deliberation_id'])
    op.create_index('ix_llm_traces_agent_id', 'llm_traces', ['agent_id'])
    op.create_index('ix_llm_traces_trace_type', 'llm_traces', ['trace_type'])
    op.create_index('ix_llm_traces_status', 'llm_traces', ['status'])
    op.create_index('ix_llm_traces_model', 'llm_traces', ['model'])
    op.create_index('ix_llm_traces_created_at', 'llm_traces', ['created_at'])


def downgrade() -> None:
    op.drop_table('llm_traces')
