"""Add category column to deliberations table

Agents specify the topic category when creating a deliberation so the
frontend can filter without keyword matching.

Valid values: 'south-africa', 'ai', 'current-affairs', 'global-politics'

Revision ID: 012
Revises: 011
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa

revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'deliberations',
        sa.Column('category', sa.String(), nullable=True)
    )
    op.create_index('ix_deliberations_category', 'deliberations', ['category'])


def downgrade() -> None:
    op.drop_index('ix_deliberations_category', table_name='deliberations')
    op.drop_column('deliberations', 'category')
