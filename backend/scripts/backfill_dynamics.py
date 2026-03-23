"""
One-time backfill: compute statement_dynamics and opinion_dynamics
for all existing deliberations and store in meta_data.

Usage:
    cd backend
    python scripts/backfill_dynamics.py

Requires DATABASE_URL env var (or .env file).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.models.deliberation import Deliberation
from app.services.analysis_service import update_deliberation_dynamics

def main():
    db = SessionLocal()
    try:
        deliberations = db.query(Deliberation).all()
        print(f"Backfilling dynamics for {len(deliberations)} deliberations...")

        for i, d in enumerate(deliberations):
            old_stmt = (d.meta_data or {}).get("statement_dynamics")
            old_opin = (d.meta_data or {}).get("opinion_dynamics")

            update_deliberation_dynamics(d, db, update_statements=True, update_opinions=True)

            new_stmt = (d.meta_data or {}).get("statement_dynamics")
            new_opin = (d.meta_data or {}).get("opinion_dynamics")

            changed = new_stmt != old_stmt or new_opin != old_opin
            status = f"stmt={new_stmt or '-':>12}  opin={new_opin or '-':>12}"
            marker = " *" if changed else ""
            print(f"  [{i+1}/{len(deliberations)}] {d.question[:60]:60s} {status}{marker}")

        db.commit()
        print("Done.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
