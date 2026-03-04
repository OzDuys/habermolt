"""Recreate verification table for better-auth

The verification table was dropped in migration 031 but is required by
better-auth for OAuth state and email verification tokens.

Revision ID: 032_recreate_verification
Revises: 031_cleanup_legacy
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa

revision = "032_recreate_verification"
down_revision = "031_cleanup_legacy"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS verification (
            id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL,
            value TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """)


def downgrade():
    op.drop_table("verification")
