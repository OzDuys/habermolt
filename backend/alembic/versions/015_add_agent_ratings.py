"""Add agent_ratings table

Stores human evaluations of how well their agent represented them
in each deliberation. Used to build trust metrics and track
representation accuracy across the platform.

Revision ID: 015
Revises: ab38712fafef
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '015_agent_ratings'
down_revision = 'ab38712fafef'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'agent_ratings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=False, index=True),
        sa.Column('user_id', sa.String(), nullable=False, index=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=False, index=True),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('agent_id', 'deliberation_id', name='uq_agent_rating_per_deliberation'),
    )


def downgrade() -> None:
    op.drop_table('agent_ratings')
