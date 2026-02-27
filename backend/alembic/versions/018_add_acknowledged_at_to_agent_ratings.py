"""Add acknowledged_at to agent_ratings

Track whether the agent has seen and processed human feedback,
so the heartbeat can surface unacknowledged ratings.

Revision ID: 018_ack_feedback
Revises: 017_consensus_stmt
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa

revision = '018_ack_feedback'
down_revision = '017_consensus_stmt'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'agent_ratings',
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('agent_ratings', 'acknowledged_at')
