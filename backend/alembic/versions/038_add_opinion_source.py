"""Add source column to opinions table

Revision ID: 038_add_opinion_source
Revises: 037_add_communities
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = "038_add_opinion_source"
down_revision = "037_add_communities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("opinions", sa.Column("source", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("opinions", "source")
