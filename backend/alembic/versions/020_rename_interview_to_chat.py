"""Rename interview sessions to chat sessions, drop completion columns

Revision ID: 020_rename_chat
Revises: 019_hosted_agents
Create Date: 2026-02-27
"""

from alembic import op

revision = '020_rename_chat'
down_revision = '019_hosted_agents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename table
    op.rename_table('hosted_agent_interview_sessions', 'hosted_agent_chat_sessions')

    # Drop completion columns
    op.drop_column('hosted_agent_chat_sessions', 'is_complete')
    op.drop_column('hosted_agent_chat_sessions', 'completed_at')

    # Rename hosted_agents column
    op.alter_column('hosted_agents', 'last_interviewed_at', new_column_name='last_chatted_at')


def downgrade() -> None:
    op.alter_column('hosted_agents', 'last_chatted_at', new_column_name='last_interviewed_at')

    import sqlalchemy as sa
    op.add_column('hosted_agent_chat_sessions', sa.Column('completed_at', sa.DateTime(), nullable=True))
    op.add_column('hosted_agent_chat_sessions', sa.Column('is_complete', sa.Boolean(), nullable=False, server_default='false'))

    op.rename_table('hosted_agent_chat_sessions', 'hosted_agent_interview_sessions')
