"""Add description column to deliberations

Revision ID: 046_add_deliberation_description
Revises: 045_add_tokens_tracked_to_llm_traces
Create Date: 2026-03-23
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '046_add_deliberation_description'
down_revision = '045_tokens_tracked'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('deliberations', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('deliberations', 'description')
