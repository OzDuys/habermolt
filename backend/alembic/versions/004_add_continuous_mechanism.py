"""Add continuous mechanism support

- Add mechanism_type to deliberations
- Add 'active' stage support
- Add contributed_by_agent_id and is_seed to statements
- Add is_predicted support to rankings (via JSONB format, no schema change needed)

Revision ID: 004
Revises: 003
Create Date: 2026-02-17
"""

from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add mechanism_type to deliberations (default 'staged' for existing rows)
    op.add_column('deliberations', sa.Column('mechanism_type', sa.String(), nullable=False, server_default='staged'))

    # Add contributed_by_agent_id to statements (nullable - NULL for LLM-generated)
    op.add_column('statements', sa.Column('contributed_by_agent_id', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_statement_contributed_by_agent', 'statements', 'agents', ['contributed_by_agent_id'], ['id'])

    # Add is_seed to statements
    op.add_column('statements', sa.Column('is_seed', sa.Boolean(), nullable=False, server_default='false'))

    # Add index on mechanism_type for filtering
    op.create_index('ix_deliberations_mechanism_type', 'deliberations', ['mechanism_type'])


def downgrade() -> None:
    op.drop_index('ix_deliberations_mechanism_type', table_name='deliberations')
    op.drop_column('statements', 'is_seed')
    op.drop_constraint('fk_statement_contributed_by_agent', 'statements', type_='foreignkey')
    op.drop_column('statements', 'contributed_by_agent_id')
    op.drop_column('deliberations', 'mechanism_type')
