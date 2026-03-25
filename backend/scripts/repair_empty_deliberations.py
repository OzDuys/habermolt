"""
One-off repair script: generate seed statements for deliberations that have
opinions but zero statements (caused by the shell-creation bug).

Usage:
    cd backend
    DATABASE_URL="<prod-url>" python scripts/repair_empty_deliberations.py

Uses the LLM_API_KEY from backend/.env for OpenRouter calls.
"""

import asyncio
import os
import sys

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, text
from app.database import SessionLocal
from app.models import Deliberation, Statement, Opinion
from app.services.continuous_deliberation_service import ContinuousDeliberationService


def find_broken_deliberations(db):
    """Find active deliberations with opinions but zero statements."""
    results = (
        db.query(
            Deliberation.id,
            Deliberation.question,
            func.count(Opinion.id).label("opinion_count"),
        )
        .outerjoin(Opinion, Opinion.deliberation_id == Deliberation.id)
        .filter(Deliberation.stage == "active")
        .group_by(Deliberation.id)
        .having(func.count(Opinion.id) > 0)
        .all()
    )

    broken = []
    for delib_id, question, opinion_count in results:
        stmt_count = db.query(Statement).filter(
            Statement.deliberation_id == delib_id
        ).count()
        if stmt_count == 0:
            broken.append((delib_id, question, opinion_count))

    return broken


async def repair_deliberation(db, deliberation):
    """Generate seed statements for a deliberation that has none."""
    service = ContinuousDeliberationService(db)
    try:
        await service._generate_seeds(deliberation)
        stmt_count = db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).count()
        print(f"  Generated {stmt_count} seed statements")
    except Exception as e:
        print(f"  Seed generation failed: {e}")
        service._create_fallback_seed(deliberation)
        print(f"  Created fallback seed statement")


def main():
    if "PRODUCTION" not in os.environ.get("DATABASE_URL", ""):
        db_url = os.environ.get("DATABASE_URL", "")
        if "rlwy.net" not in db_url and "railway" not in db_url:
            print("WARNING: DATABASE_URL doesn't look like production.")
            resp = input("Continue anyway? [y/N] ")
            if resp.lower() != "y":
                return

    db = SessionLocal()
    try:
        broken = find_broken_deliberations(db)

        if not broken:
            print("No broken deliberations found.")
            return

        print(f"Found {len(broken)} deliberation(s) with opinions but no statements:\n")
        for delib_id, question, opinion_count in broken:
            print(f"  [{delib_id}] {question[:70]}")
            print(f"    {opinion_count} opinions, 0 statements")
        print()

        resp = input(f"Generate seed statements for all {len(broken)}? [y/N] ")
        if resp.lower() != "y":
            print("Aborted.")
            return

        for delib_id, question, opinion_count in broken:
            print(f"\nRepairing: {question[:60]}...")
            deliberation = db.query(Deliberation).get(delib_id)
            asyncio.run(repair_deliberation(db, deliberation))

        print("\nDone.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
