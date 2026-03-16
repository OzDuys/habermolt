"""Add approval_status, disapproval_reason, corrected_at to notifications

Revision ID: 039_add_notification_approval
Revises: 038_add_opinion_source
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "039_add_notification_approval"
down_revision = "038_add_opinion_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("approval_status", sa.String(20), nullable=True))
    op.add_column("notifications", sa.Column("disapproval_reason", sa.Text(), nullable=True))
    op.add_column("notifications", sa.Column("corrected_at", sa.DateTime(), nullable=True))
    op.create_index("ix_notifications_approval_status", "notifications", ["approval_status"])


def downgrade() -> None:
    op.drop_index("ix_notifications_approval_status", table_name="notifications")
    op.drop_column("notifications", "corrected_at")
    op.drop_column("notifications", "disapproval_reason")
    op.drop_column("notifications", "approval_status")
