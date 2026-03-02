"""Drop heartbeat_sessions table

Revision ID: 025_drop_heartbeat_sessions
Revises: 024_moderation_logs
Create Date: 2026-03-02

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '025_drop_heartbeat_sessions'
down_revision = '024_moderation_logs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table('heartbeat_sessions')


def downgrade() -> None:
    # Not restoring — data loss accepted
    pass
