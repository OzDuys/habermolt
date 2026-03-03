"""Add setup_progress column to agent_sessions

Revision ID: 029_setup_progress
Revises: 028_unify_sessions
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "029_setup_progress"
down_revision = "028_unify_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_sessions", sa.Column("setup_progress", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_sessions", "setup_progress")
