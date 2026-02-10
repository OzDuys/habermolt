"""Replace max_citizens with join_window_deadline

Revision ID: 002
Revises: 001
Create Date: 2026-02-10
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('deliberations', 'max_citizens')
    op.add_column('deliberations', sa.Column('join_window_deadline', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('deliberations', 'join_window_deadline')
    op.add_column('deliberations', sa.Column('max_citizens', sa.Integer(), nullable=True))
