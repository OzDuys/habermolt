"""Add topic_interview_sessions table

Revision ID: 026_topic_interview_sessions
Revises: 025_drop_heartbeat_sessions
Create Date: 2026-03-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '026_topic_interview_sessions'
down_revision = '025_drop_heartbeat_sessions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('topic_interview_sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('agent_id', sa.UUID(), nullable=False),
    sa.Column('deliberation_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('messages', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
    sa.ForeignKeyConstraint(['deliberation_id'], ['deliberations.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_topic_interview_sessions_agent_id'), 'topic_interview_sessions', ['agent_id'], unique=False)
    op.create_index(op.f('ix_topic_interview_sessions_deliberation_id'), 'topic_interview_sessions', ['deliberation_id'], unique=False)
    op.create_index(op.f('ix_topic_interview_sessions_user_id'), 'topic_interview_sessions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_topic_interview_sessions_user_id'), table_name='topic_interview_sessions')
    op.drop_index(op.f('ix_topic_interview_sessions_deliberation_id'), table_name='topic_interview_sessions')
    op.drop_index(op.f('ix_topic_interview_sessions_agent_id'), table_name='topic_interview_sessions')
    op.drop_table('topic_interview_sessions')
