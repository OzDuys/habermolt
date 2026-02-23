"""Allow null api_key on agents for deactivated/unlinked agents

Revision ID: 010
Revises: 009
Create Date: 2026-02-23
"""

from alembic import op

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('agents', 'api_key', nullable=True)


def downgrade():
    # Re-adding NOT NULL requires no existing nulls — only safe if all agents have keys
    op.alter_column('agents', 'api_key', nullable=False)
