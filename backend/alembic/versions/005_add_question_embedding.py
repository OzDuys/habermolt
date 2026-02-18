"""Add question_embedding to deliberations for similarity search

Enables pgvector extension and adds a 1536-dimension vector column to
deliberations so that new deliberations can be checked for semantic
similarity against existing ones before creation.

Revision ID: 005
Revises: 004
Create Date: 2026-02-18
"""

from alembic import op

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable the pgvector extension (idempotent)
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # Add nullable vector column (1536 dims = text-embedding-3-small)
    op.execute('ALTER TABLE deliberations ADD COLUMN question_embedding vector(1536)')

    # HNSW index for fast approximate cosine similarity queries
    op.execute(
        'CREATE INDEX ix_deliberations_question_embedding '
        'ON deliberations USING hnsw (question_embedding vector_cosine_ops)'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_deliberations_question_embedding')
    op.execute('ALTER TABLE deliberations DROP COLUMN IF EXISTS question_embedding')
