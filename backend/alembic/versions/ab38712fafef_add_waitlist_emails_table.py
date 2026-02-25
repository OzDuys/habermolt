"""Add waitlist_emails table

Revision ID: ab38712fafef
Revises: 014
Create Date: 2026-02-25 14:04:03.375822+00:00

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'ab38712fafef'
down_revision = '014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('waitlist_emails',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('submitted_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_waitlist_emails_email'), 'waitlist_emails', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_waitlist_emails_email'), table_name='waitlist_emails')
    op.drop_table('waitlist_emails')
