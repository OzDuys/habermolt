"""Add thumb_vote to consensus_ratings and make star columns nullable.

Revision ID: 043_add_thumb_vote
Revises: 042_stmt_is_evicted
Create Date: 2026-03-18
"""
from alembic import op
import sqlalchemy as sa

revision = "043_add_thumb_vote"
down_revision = "042_stmt_is_evicted"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("consensus_ratings", sa.Column("thumb_vote", sa.String(4), nullable=True))
    op.alter_column("consensus_ratings", "representativeness", existing_type=sa.Integer(), nullable=True)
    op.alter_column("consensus_ratings", "specificity", existing_type=sa.Integer(), nullable=True)
    op.alter_column("consensus_ratings", "usefulness", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.drop_column("consensus_ratings", "thumb_vote")
    op.alter_column("consensus_ratings", "representativeness", existing_type=sa.Integer(), nullable=False)
    op.alter_column("consensus_ratings", "specificity", existing_type=sa.Integer(), nullable=False)
    op.alter_column("consensus_ratings", "usefulness", existing_type=sa.Integer(), nullable=False)
