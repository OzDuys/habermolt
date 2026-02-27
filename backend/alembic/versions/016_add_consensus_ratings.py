"""Add consensus_ratings table

Multi-dimensional ratings for consensus statement quality:
representativeness, specificity, and usefulness.

Revision ID: 016
Revises: 015
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '016_consensus_ratings'
down_revision = '015_agent_ratings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'consensus_ratings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.String(), nullable=False, index=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=False, index=True),
        sa.Column('representativeness', sa.Integer(), nullable=False),
        sa.Column('specificity', sa.Integer(), nullable=False),
        sa.Column('usefulness', sa.Integer(), nullable=False),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'deliberation_id', name='uq_consensus_rating_per_user_delib'),
    )


def downgrade() -> None:
    op.drop_table('consensus_ratings')
