"""
Backfill profile_snapshots from llm_traces.

For each hosted agent, walk forward chronologically through every trace that
represents a profile change and reconstruct the profile state at each point.
Insert one ProfileSnapshot row per change. If the reconstructed final state
does not equal the agent's current user_profile, insert a single "catch-up"
snapshot tagged manual_edit + backfill_unrecovered so the timeline anchors to
present reality.

This is a one-off script: not idempotent. Run once per environment after
migration 052 deploys.

Usage:
    cd backend
    python scripts/backfill_profile_snapshots.py --dry-run
    python scripts/backfill_profile_snapshots.py --hosted-agent-id <uuid> --confirm BACKFILL
    python scripts/backfill_profile_snapshots.py --prod --dry-run
    python scripts/backfill_profile_snapshots.py --prod --confirm BACKFILL
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(_REPO_ROOT, ".env"), override=True)
load_dotenv()

if "--prod" in sys.argv:
    prod_url = os.environ.get("PRODUCTION_DATABASE_URL")
    if not prod_url:
        print("ERROR: --prod requested but PRODUCTION_DATABASE_URL is not set in root .env.", file=sys.stderr)
        sys.exit(1)
    os.environ["DATABASE_URL"] = prod_url

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.grounding_log import GroundingLog
from app.models.hosted_agent import HostedAgent
from app.models.llm_trace import LLMTrace
from app.models.profile_snapshot import ProfileSnapshot


# Map grounding_logs.metadata->>'trigger' to our ProfileSnapshot.trigger enum.
GROUNDING_TRIGGER_MAP = {
    "approval": "approval_rewrite",
    "save_with_critiques": "approval_rewrite",
    "save_edit": "approval_rewrite",
    "withdrawal": "withdrawal_rewrite",
}


def backfill_agent(db: Session, ha: HostedAgent, dry_run: bool, force: bool) -> dict:
    """Backfill snapshots for one hosted agent. Returns a per-user report dict.

    Source of truth: grounding_logs (event_type='profile_updated'). Each row
    stores the full post-edit profile in output_text. We don't try to
    reconstruct pre-grounding-logs history (it predates April 2026 and the
    only signal there is append-style llm_traces that produced misleading
    diffs against today's full-rewrite profiles).
    """
    existing = db.query(ProfileSnapshot).filter(ProfileSnapshot.hosted_agent_id == ha.id).count()
    if existing > 0 and not force:
        return {
            "hosted_agent_id": str(ha.id),
            "display_name": ha.display_name,
            "skipped": "already has snapshots",
            "existing_count": existing,
        }

    logs = (
        db.query(GroundingLog)
        .filter(GroundingLog.hosted_agent_id == ha.id)
        .filter(GroundingLog.event_type == "profile_updated")
        .filter(GroundingLog.output_text.isnot(None))
        .order_by(GroundingLog.created_at.asc())
        .all()
    )

    snapshots_to_add: list[ProfileSnapshot] = []

    # Earlier-history placeholder for users whose first grounding_log shows
    # they already had a non-trivial profile before any tracked event ran.
    if logs and (logs[0].profile_version_before or 0) > 0:
        first = logs[0]
        ts = first.created_at if first.created_at.tzinfo else first.created_at.replace(tzinfo=timezone.utc)
        # Place the placeholder just before the first tracked event.
        placeholder_ts = ts.replace(microsecond=0) - timedelta(seconds=1)
        snapshots_to_add.append(
            ProfileSnapshot(
                hosted_agent_id=ha.id,
                profile_markdown="(Earlier edits — full snapshot not retained)",
                profile_version=0,
                trigger="manual_edit",
                source_type="backfill_unrecovered",
                source_id=None,
                created_at=placeholder_ts,
            )
        )

    for log in logs:
        trigger_raw = (log.metadata_ or {}).get("trigger") if log.metadata_ else None
        trigger = GROUNDING_TRIGGER_MAP.get(trigger_raw, "approval_rewrite")
        ts = log.created_at if log.created_at.tzinfo else log.created_at.replace(tzinfo=timezone.utc)
        snapshots_to_add.append(
            ProfileSnapshot(
                hosted_agent_id=ha.id,
                profile_markdown=(log.output_text or "").strip(),
                profile_version=log.profile_version_after or (len(snapshots_to_add) + 1),
                trigger=trigger,
                source_type="notification" if log.notification_id else None,
                source_id=log.notification_id,
                created_at=ts,
            )
        )

    inserted = len(logs)
    last_snapshot_md = snapshots_to_add[-1].profile_markdown.strip() if snapshots_to_add else ""

    current_profile = (ha.user_profile or "").strip()
    catch_up_inserted = False

    if current_profile and current_profile != last_snapshot_md:
        # Either there were untracked edits after the latest grounding_log,
        # or this agent has no grounding_logs at all. Anchor the timeline
        # to current reality with one catch-up entry.
        last_ts = ha.updated_at if ha.updated_at else datetime.now(timezone.utc)
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        snapshots_to_add.append(
            ProfileSnapshot(
                hosted_agent_id=ha.id,
                profile_markdown=ha.user_profile or "",
                profile_version=ha.profile_version,
                trigger="manual_edit",
                source_type="backfill_unrecovered",
                source_id=None,
                created_at=last_ts,
            )
        )
        catch_up_inserted = True

    if not dry_run:
        for s in snapshots_to_add:
            db.add(s)
        db.commit()

    expected = ha.profile_version
    gap = expected - inserted - (1 if catch_up_inserted else 0)

    return {
        "hosted_agent_id": str(ha.id),
        "display_name": ha.display_name,
        "expected_versions": expected,
        "recovered_snapshots": inserted,
        "catch_up_inserted": catch_up_inserted,
        "gap": gap,
        "total_inserted": len(snapshots_to_add),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prod", action="store_true", help="Use PRODUCTION_DATABASE_URL")
    parser.add_argument("--dry-run", action="store_true", help="Don't insert; just print the report")
    parser.add_argument("--hosted-agent-id", help="Limit to a single hosted agent")
    parser.add_argument("--user-id", help="Limit to a single user_id (better-auth)")
    parser.add_argument("--confirm", help="Required token for non-dry-run mode: BACKFILL")
    parser.add_argument("--force", action="store_true", help="Re-backfill agents that already have snapshots")
    args = parser.parse_args()

    if not args.dry_run and args.confirm != "BACKFILL":
        print("ERROR: real runs require --confirm BACKFILL", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        q = db.query(HostedAgent)
        if args.hosted_agent_id:
            q = q.filter(HostedAgent.id == UUID(args.hosted_agent_id))
        elif args.user_id:
            q = q.filter(HostedAgent.user_id == args.user_id)
        agents = q.order_by(HostedAgent.created_at.asc()).all()

        if not agents:
            print("No hosted agents matched.", file=sys.stderr)
            return

        reports = []
        for ha in agents:
            report = backfill_agent(db, ha, dry_run=args.dry_run, force=args.force)
            reports.append(report)
            print(json.dumps(report, default=str))

        # Summary
        recovered_total = sum(r.get("recovered_snapshots", 0) for r in reports)
        catch_ups = sum(1 for r in reports if r.get("catch_up_inserted"))
        gap_users = [r for r in reports if r.get("gap", 0) > 0]
        skipped = [r for r in reports if r.get("skipped")]

        print("---", file=sys.stderr)
        print(f"Agents processed: {len(reports)}", file=sys.stderr)
        print(f"Agents skipped (already had snapshots): {len(skipped)}", file=sys.stderr)
        print(f"Total snapshots recovered: {recovered_total}", file=sys.stderr)
        print(f"Catch-up snapshots inserted: {catch_ups}", file=sys.stderr)
        print(f"Users with unaccounted gap > 0: {len(gap_users)}", file=sys.stderr)
        if args.dry_run:
            print("DRY RUN — nothing was written.", file=sys.stderr)
    finally:
        db.close()


if __name__ == "__main__":
    main()
