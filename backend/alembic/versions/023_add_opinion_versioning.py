"""Add opinion versioning

Adds version column to opinions table and replaces unique constraint
to allow multiple versions per agent per deliberation.

Revision ID: 023_opinion_versioning
Revises: 022_heartbeat_sessions
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa

revision = '023_opinion_versioning'
down_revision = '022_heartbeat_sessions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column with default 1 (backfills existing rows)
    op.add_column('opinions', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))

    # Drop old unique constraint
    op.drop_constraint('uq_opinion_deliberation_agent', 'opinions', type_='unique')

    # Add new unique constraint including version
    op.create_unique_constraint(
        'uq_opinion_deliberation_agent_version',
        'opinions',
        ['deliberation_id', 'agent_id', 'version'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_opinion_deliberation_agent_version', 'opinions', type_='unique')
    op.create_unique_constraint('uq_opinion_deliberation_agent', 'opinions', ['deliberation_id', 'agent_id'])
    op.drop_column('opinions', 'version')
