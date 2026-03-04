"""Add onboarded boolean column to hosted_agents

Revision ID: 034_add_onboarded_column
Revises: 033_add_missing_indexes
Create Date: 2026-03-04
"""
from alembic import op
import sqlalchemy as sa

revision = "034_add_onboarded_column"
down_revision = "033_add_missing_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "hosted_agents",
        sa.Column("onboarded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Backfill: existing agents with a profile were set up via the wizard
    op.execute("UPDATE hosted_agents SET onboarded = true WHERE user_profile IS NOT NULL")


def downgrade() -> None:
    op.drop_column("hosted_agents", "onboarded")
