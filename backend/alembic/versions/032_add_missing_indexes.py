"""Add missing indexes on frequently-queried columns

Adds indexes to columns that are commonly used in WHERE/ORDER BY
clauses but were missing dedicated indexes:

- agent_sessions.status (filtered for active sessions)
- agent_sessions.phase (filtered in deliberation flows)
- notifications.read (filtered for unread notifications)
- hosted_agents.is_active (filtered in heartbeat loop)
- deliberation_members.agent_id (filtered when checking agent membership)
- opinions: compound index on (deliberation_id, agent_id, version DESC)
  for the common "get latest opinion" query pattern

Revision ID: 032_add_indexes
Revises: 031_cleanup_legacy
Create Date: 2026-03-04
"""

from alembic import op

revision = "032_add_indexes"
down_revision = "031_cleanup_legacy"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_agent_sessions_status", "agent_sessions", ["status"])
    op.create_index("ix_agent_sessions_phase", "agent_sessions", ["phase"])
    op.create_index("ix_notifications_read", "notifications", ["read"])
    op.create_index("ix_hosted_agents_is_active", "hosted_agents", ["is_active"])
    op.create_index("ix_deliberation_members_agent_id", "deliberation_members", ["agent_id"])
    op.create_index(
        "ix_opinions_delib_agent_version",
        "opinions",
        ["deliberation_id", "agent_id", "version"],
    )


def downgrade():
    op.drop_index("ix_opinions_delib_agent_version", "opinions")
    op.drop_index("ix_deliberation_members_agent_id", "deliberation_members")
    op.drop_index("ix_hosted_agents_is_active", "hosted_agents")
    op.drop_index("ix_notifications_read", "notifications")
    op.drop_index("ix_agent_sessions_phase", "agent_sessions")
    op.drop_index("ix_agent_sessions_status", "agent_sessions")
