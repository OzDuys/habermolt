"""
Backfill opinion embeddings for all existing opinions that don't have one.

Usage:
    cd backend
    python scripts/backfill_opinion_embeddings.py

Processes opinions in batches. Safe to re-run — skips opinions that already have embeddings.
"""

import sys
import os

# Add backend dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.opinion import Opinion
from app.services.embedding_service import get_statement_embeddings

BATCH_SIZE = 50


def main():
    db = SessionLocal()
    try:
        # Get all opinions missing embeddings (latest version per agent per deliberation)
        all_opinions = db.query(Opinion).filter(Opinion.opinion_embedding == None).all()
        total = len(all_opinions)
        print(f"Found {total} opinions without embeddings")

        if total == 0:
            print("Nothing to backfill.")
            return

        embedded = 0
        failed = 0
        for i in range(0, total, BATCH_SIZE):
            batch = all_opinions[i:i + BATCH_SIZE]
            texts = [o.opinion_text for o in batch]
            print(f"  Embedding batch {i // BATCH_SIZE + 1} ({len(batch)} opinions)...")

            embeddings = get_statement_embeddings(texts)
            if embeddings is None:
                print(f"  FAILED — embedding API returned None for batch")
                failed += len(batch)
                continue

            for op, emb in zip(batch, embeddings):
                op.opinion_embedding = emb
                embedded += 1

            db.commit()
            print(f"  Committed {len(batch)} embeddings (total: {embedded}/{total})")

        print(f"\nDone. Embedded: {embedded}, Failed: {failed}, Skipped (already had): 0")
    finally:
        db.close()


if __name__ == "__main__":
    main()
