"""Add cost tracking columns to llm_traces

Stores per-call cost data from OpenRouter (or estimated from pricing table).
Enables cost-per-model breakdown on the monitoring dashboard.

Revision ID: 014
Revises: 013
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa

revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('llm_traces', sa.Column('cost_input', sa.Float(), nullable=True))
    op.add_column('llm_traces', sa.Column('cost_output', sa.Float(), nullable=True))
    op.add_column('llm_traces', sa.Column('cost_total', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('llm_traces', 'cost_total')
    op.drop_column('llm_traces', 'cost_output')
    op.drop_column('llm_traces', 'cost_input')
