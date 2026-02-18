"""Add statement_embedding to statements for cluster visualization

Adds a 1536-dimension vector column to statements so that the cluster
endpoint can persist embeddings after lazy generation and avoid
re-embedding on every request.

Revision ID: 006
Revises: 005
Create Date: 2026-02-18
"""

from alembic import op

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector extension already enabled by migration 005
    op.execute('ALTER TABLE statements ADD COLUMN statement_embedding vector(1536)')

    # Partial HNSW index — only indexes rows that have embeddings
    op.execute(
        'CREATE INDEX ix_statements_statement_embedding '
        'ON statements USING hnsw (statement_embedding vector_cosine_ops) '
        'WHERE statement_embedding IS NOT NULL'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS ix_statements_statement_embedding')
    op.execute('ALTER TABLE statements DROP COLUMN IF EXISTS statement_embedding')
