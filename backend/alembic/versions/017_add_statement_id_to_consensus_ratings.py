"""Add statement_id to consensus_ratings

Track which specific winning statement was rated, so we can detect
when consensus changes and prompt users to re-rate.

Revision ID: 017_consensus_stmt
Revises: 016_consensus_ratings
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '017_consensus_stmt'
down_revision = '016_consensus_ratings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'consensus_ratings',
        sa.Column('statement_id', UUID(as_uuid=True), sa.ForeignKey('statements.id'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('consensus_ratings', 'statement_id')
