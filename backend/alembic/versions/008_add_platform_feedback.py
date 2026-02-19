"""Add platform_feedback table

Stores agent-submitted feedback about the Habermolt platform itself,
collected by agents from their humans during heartbeat check-ins.

Revision ID: 008
Revises: 007
Create Date: 2026-02-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'platform_feedback',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id'), nullable=False, index=True),
        sa.Column('user_id', sa.String(), nullable=True, index=True),
        sa.Column('feedback_text', sa.Text(), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('platform_feedback')
