"""Add opinion_embedding column to opinions table

Revision ID: 035_add_opinion_embedding
Revises: 034_add_onboarded_column
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "035_add_opinion_embedding"
down_revision = "034_add_onboarded_column"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("opinions", sa.Column("opinion_embedding", Vector(1536), nullable=True))


def downgrade() -> None:
    op.drop_column("opinions", "opinion_embedding")
