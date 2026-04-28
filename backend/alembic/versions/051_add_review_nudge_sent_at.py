"""Add review_nudge_sent_at to notifications for weekly review-email idempotency

Revision ID: 051_review_nudge_sent_at
Revises: 050_drop_dotd
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "051_review_nudge_sent_at"
down_revision = "050_drop_dotd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "notifications",
        sa.Column("review_nudge_sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_notifications_review_nudge_sent_at",
        "notifications",
        ["review_nudge_sent_at"],
    )


def downgrade():
    op.drop_index(
        "ix_notifications_review_nudge_sent_at",
        table_name="notifications",
    )
    op.drop_column("notifications", "review_nudge_sent_at")
