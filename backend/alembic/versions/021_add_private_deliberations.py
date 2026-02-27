"""Add private deliberation support

Adds is_private, invite_code, complexity_tier, created_by_user_id,
max_participants columns to deliberations table, and creates
deliberation_members table for membership tracking.

Revision ID: 021_private_deliberations
Revises: 020_rename_chat
Create Date: 2026-02-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '021_private_deliberations'
down_revision = '020_rename_chat'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add private deliberation columns to deliberations table
    op.add_column('deliberations', sa.Column('is_private', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('deliberations', sa.Column('invite_code', sa.String(), nullable=True))
    op.add_column('deliberations', sa.Column('complexity_tier', sa.String(), nullable=True))
    op.add_column('deliberations', sa.Column('created_by_user_id', sa.String(), nullable=True))
    op.add_column('deliberations', sa.Column('max_participants', sa.Integer(), nullable=True))

    op.create_index('ix_deliberations_is_private', 'deliberations', ['is_private'])
    op.create_index('ix_deliberations_invite_code', 'deliberations', ['invite_code'], unique=True)
    op.create_index('ix_deliberations_created_by_user_id', 'deliberations', ['created_by_user_id'])

    # Create deliberation_members table
    op.create_table(
        'deliberation_members',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('deliberation_id', UUID(as_uuid=True), sa.ForeignKey('deliberations.id'), nullable=False),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('joined_by_user_id', sa.String(), nullable=True),
        sa.UniqueConstraint('deliberation_id', 'agent_id', name='uq_deliberation_member'),
    )
    op.create_index('ix_deliberation_members_deliberation_id', 'deliberation_members', ['deliberation_id'])


def downgrade() -> None:
    op.drop_table('deliberation_members')
    op.drop_index('ix_deliberations_created_by_user_id', table_name='deliberations')
    op.drop_index('ix_deliberations_invite_code', table_name='deliberations')
    op.drop_index('ix_deliberations_is_private', table_name='deliberations')
    op.drop_column('deliberations', 'max_participants')
    op.drop_column('deliberations', 'created_by_user_id')
    op.drop_column('deliberations', 'complexity_tier')
    op.drop_column('deliberations', 'invite_code')
    op.drop_column('deliberations', 'is_private')
