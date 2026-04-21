"""Drop dotd_selections and deliberations.prompt_config

Revision ID: 050_drop_dotd
Revises: 049_prompt_config_dotd
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision = "050_drop_dotd"
down_revision = "049_prompt_config_dotd"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_dotd_selections_featured_date", table_name="dotd_selections")
    op.drop_table("dotd_selections")
    op.drop_column("deliberations", "prompt_config")


def downgrade():
    op.add_column("deliberations", sa.Column("prompt_config", JSONB, nullable=True))
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
