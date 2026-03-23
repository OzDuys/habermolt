"""Add ranking_snapshots table and has_full_ranking_history flag

Revision ID: 047_ranking_snapshots
Revises: 046_add_deliberation_description
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = '047_ranking_snapshots'
down_revision = '046_add_deliberation_description'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ranking_snapshots table
    op.create_table(
        'ranking_snapshots',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=False, index=True),
        sa.Column('rankings_data', JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # Add has_full_ranking_history to deliberations (default False for existing rows)
    op.add_column('deliberations', sa.Column(
        'has_full_ranking_history', sa.Boolean(), nullable=False, server_default='false',
    ))


def downgrade() -> None:
    op.drop_column('deliberations', 'has_full_ranking_history')
    op.drop_table('ranking_snapshots')
