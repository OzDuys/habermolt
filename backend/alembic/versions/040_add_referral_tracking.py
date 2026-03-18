"""Add referral_codes and referrals tables for referral tracking

Revision ID: 040_add_referral_tracking
Revises: 039_add_notification_approval
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "040_add_referral_tracking"
down_revision = "039_add_notification_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "referral_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("code", sa.String(12), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_referral_codes_user_id", "referral_codes", ["user_id"], unique=True)
    op.create_index("ix_referral_codes_code", "referral_codes", ["code"], unique=True)

    op.create_table(
        "referrals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("referrer_user_id", sa.String(), nullable=False),
        sa.Column("referred_user_id", sa.String(), nullable=False),
        sa.Column("converted_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_referrals_referrer_user_id", "referrals", ["referrer_user_id"])
    op.create_index("ix_referrals_referred_user_id", "referrals", ["referred_user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_referrals_referred_user_id", table_name="referrals")
    op.drop_index("ix_referrals_referrer_user_id", table_name="referrals")
    op.drop_table("referrals")
    op.drop_index("ix_referral_codes_code", table_name="referral_codes")
    op.drop_index("ix_referral_codes_user_id", table_name="referral_codes")
    op.drop_table("referral_codes")
