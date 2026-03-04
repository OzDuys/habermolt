"""Add phase column to agent_sessions and unify session types

Revision ID: 030_session_phase
Revises: 029_setup_progress
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa

revision = "030_session_phase"
down_revision = "029_setup_progress"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_sessions", sa.Column("phase", sa.String(), nullable=True))

    # Backfill phases based on current session_type and status
    op.execute("""
        UPDATE agent_sessions
        SET phase = 'participating'
        WHERE session_type IN ('deliberation_join', 'deliberation_chat') AND status = 'completed'
    """)
    op.execute("""
        UPDATE agent_sessions
        SET phase = 'browsing'
        WHERE session_type = 'deliberation_join' AND status = 'active'
    """)
    op.execute("""
        UPDATE agent_sessions
        SET phase = 'setup'
        WHERE session_type = 'deliberation_join' AND status = 'setup_running'
    """)
    op.execute("""
        UPDATE agent_sessions
        SET phase = 'participating'
        WHERE session_type = 'deliberation_chat' AND phase IS NULL
    """)

    # Unify session types: deliberation_join + deliberation_chat → deliberation
    op.execute("""
        UPDATE agent_sessions
        SET session_type = 'deliberation'
        WHERE session_type IN ('deliberation_join', 'deliberation_chat')
    """)


def downgrade():
    # Restore old session types based on phase
    op.execute("""
        UPDATE agent_sessions
        SET session_type = 'deliberation_chat'
        WHERE session_type = 'deliberation' AND phase = 'participating'
    """)
    op.execute("""
        UPDATE agent_sessions
        SET session_type = 'deliberation_join'
        WHERE session_type = 'deliberation'
    """)
    op.drop_column("agent_sessions", "phase")
