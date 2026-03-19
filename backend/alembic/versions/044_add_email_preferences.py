"""Add email_preferences table.

Revision ID: 044_email_preferences
Revises: 043_add_thumb_vote
Create Date: 2026-03-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "044_email_preferences"
down_revision = "043_add_thumb_vote"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("weekly_summary", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("marketing", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("welcome_email_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("agent_ready_email_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("unsubscribe_token", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_email_preferences_user_id", "email_preferences", ["user_id"], unique=True)
    op.create_index("ix_email_preferences_unsubscribe_token", "email_preferences", ["unsubscribe_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_email_preferences_unsubscribe_token", table_name="email_preferences")
    op.drop_index("ix_email_preferences_user_id", table_name="email_preferences")
    op.drop_table("email_preferences")
