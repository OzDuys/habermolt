"""Add prompt_config to deliberations and create dotd_selections table

Revision ID: 049_prompt_config_dotd
Revises: 048_grounding_logs
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "049_prompt_config_dotd"
down_revision = "048_grounding_logs"
branch_labels = None
depends_on = None


def upgrade():
    # Add prompt_config JSONB column to deliberations
    op.add_column("deliberations", sa.Column("prompt_config", JSONB, nullable=True))

    # Create dotd_selections table
    op.create_table(
        "dotd_selections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("deliberation_id", UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=False),
        sa.Column("meta_deliberation_id", UUID(as_uuid=True), sa.ForeignKey("deliberations.id"), nullable=True),
        sa.Column("featured_date", sa.Date(), nullable=False, unique=True),
        sa.Column("selection_method", sa.String(50), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("selected_at", sa.DateTime(), nullable=False),
        sa.Column("selected_by_user_id", sa.String(), nullable=True),
    )
    op.create_index("ix_dotd_selections_featured_date", "dotd_selections", ["featured_date"])


def downgrade():
    op.drop_index("ix_dotd_selections_featured_date")
    op.drop_table("dotd_selections")
    op.drop_column("deliberations", "prompt_config")
