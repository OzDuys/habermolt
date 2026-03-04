"""Cleanup legacy columns and tables

Drop unused deliberation columns (max_participants, join_window_deadline,
num_critique_rounds, current_critique_round, started_at, concluded_at,
finalized_at, complexity_tier), drop round_number from statements and
rankings, drop critiques table, drop human_feedback table, and drop
verification table (unused better-auth table).

Also updates the rankings unique constraint to remove round_number.

Revision ID: 031_cleanup_legacy
Revises: 030_session_phase
Create Date: 2026-03-04
"""

from alembic import op
import sqlalchemy as sa

revision = "031_cleanup_legacy"
down_revision = "030_session_phase"
branch_labels = None
depends_on = None


def upgrade():
    # --- Drop legacy deliberation columns ---
    op.drop_column("deliberations", "max_participants")
    op.drop_column("deliberations", "join_window_deadline")
    op.drop_column("deliberations", "num_critique_rounds")
    op.drop_column("deliberations", "current_critique_round")
    op.drop_column("deliberations", "started_at")
    op.drop_column("deliberations", "concluded_at")
    op.drop_column("deliberations", "finalized_at")
    op.drop_column("deliberations", "complexity_tier")

    # --- Drop round_number from statements ---
    op.drop_column("statements", "round_number")

    # --- Drop round_number from rankings ---
    # First drop the old unique constraint that includes round_number
    op.drop_constraint("uq_ranking_deliberation_agent_round", "rankings", type_="unique")
    op.drop_column("rankings", "round_number")
    # Create new unique constraint without round_number
    op.create_unique_constraint(
        "uq_ranking_deliberation_agent", "rankings",
        ["deliberation_id", "agent_id"]
    )

    # --- Drop legacy tables (if they exist) ---
    op.execute("DROP TABLE IF EXISTS critiques CASCADE")
    op.execute("DROP TABLE IF EXISTS human_feedback CASCADE")
    op.execute("DROP TABLE IF EXISTS verification CASCADE")


def downgrade():
    # Restore verification, human_feedback, critiques tables are NOT restored
    # (they were empty/unused legacy tables)

    # Restore round_number on rankings
    op.drop_constraint("uq_ranking_deliberation_agent", "rankings", type_="unique")
    op.add_column("rankings", sa.Column("round_number", sa.Integer(), nullable=False, server_default="0"))
    op.create_unique_constraint(
        "uq_ranking_deliberation_agent_round", "rankings",
        ["deliberation_id", "agent_id", "round_number"]
    )

    # Restore round_number on statements
    op.add_column("statements", sa.Column("round_number", sa.Integer(), nullable=False, server_default="0"))

    # Restore deliberation columns
    op.add_column("deliberations", sa.Column("complexity_tier", sa.String(), nullable=True))
    op.add_column("deliberations", sa.Column("finalized_at", sa.DateTime(), nullable=True))
    op.add_column("deliberations", sa.Column("concluded_at", sa.DateTime(), nullable=True))
    op.add_column("deliberations", sa.Column("started_at", sa.DateTime(), nullable=True))
    op.add_column("deliberations", sa.Column("current_critique_round", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("deliberations", sa.Column("num_critique_rounds", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("deliberations", sa.Column("join_window_deadline", sa.DateTime(), nullable=True))
    op.add_column("deliberations", sa.Column("max_participants", sa.Integer(), nullable=True))
