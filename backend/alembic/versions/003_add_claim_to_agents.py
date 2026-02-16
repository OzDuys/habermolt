"""Add user_id and claim_token to agents

Revision ID: 003
Revises: 002
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('agents', sa.Column('user_id', sa.String(), nullable=True))
    op.add_column('agents', sa.Column('claim_token', sa.String(), nullable=True))
    op.add_column('agents', sa.Column('claim_token_expires_at', sa.DateTime(), nullable=True))
    op.create_unique_constraint('uq_agents_user_id', 'agents', ['user_id'])
    op.create_index('ix_agents_claim_token', 'agents', ['claim_token'])


def downgrade():
    op.drop_index('ix_agents_claim_token', table_name='agents')
    op.drop_constraint('uq_agents_user_id', 'agents', type_='unique')
    op.drop_column('agents', 'claim_token_expires_at')
    op.drop_column('agents', 'claim_token')
    op.drop_column('agents', 'user_id')
