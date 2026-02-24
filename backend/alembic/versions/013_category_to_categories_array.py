"""Replace category (String) with categories (String[]) on deliberations

Deliberations can now belong to multiple categories. Existing single-category
values are migrated into the new array column.

Revision ID: 013
Revises: 012
Create Date: 2026-02-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the new array column
    op.add_column(
        'deliberations',
        sa.Column('categories', ARRAY(sa.String()), nullable=True, server_default='{}')
    )

    # Migrate any existing single-category values into the array
    op.execute(
        "UPDATE deliberations SET categories = ARRAY[category] WHERE category IS NOT NULL"
    )

    # Drop the old scalar column + its index
    op.drop_index('ix_deliberations_category', table_name='deliberations')
    op.drop_column('deliberations', 'category')


def downgrade() -> None:
    op.add_column(
        'deliberations',
        sa.Column('category', sa.String(), nullable=True)
    )
    # Best-effort: restore first element of the array as the scalar category
    op.execute(
        "UPDATE deliberations SET category = categories[1] WHERE cardinality(categories) > 0"
    )
    op.create_index('ix_deliberations_category', 'deliberations', ['category'])
    op.drop_column('deliberations', 'categories')
