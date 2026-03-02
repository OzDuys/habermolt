"""Add moderation_logs table

Revision ID: 024_moderation_logs
Revises: 023_opinion_versioning
Create Date: 2026-03-02 10:20:24.853096+00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '024_moderation_logs'
down_revision = '023_opinion_versioning'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('moderation_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('question', sa.Text(), nullable=False),
    sa.Column('passed', sa.Boolean(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('source', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_moderation_logs_created_at'), 'moderation_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_moderation_logs_passed'), 'moderation_logs', ['passed'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_moderation_logs_passed'), table_name='moderation_logs')
    op.drop_index(op.f('ix_moderation_logs_created_at'), table_name='moderation_logs')
    op.drop_table('moderation_logs')
