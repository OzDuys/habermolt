"""
Repair evicted statement data corruption.

Problem: Eviction decisions were based on corrupt/NULL social rankings (Schulze was
failing due to gapped ranks). This script un-evicts all statements and recomputes
Schulze from clean data.

Usage:
    # Dry run (default) — prints what would change
    python scripts/repair_evicted_statements.py

    # Actually write changes
    python scripts/repair_evicted_statements.py --commit
"""

import argparse
import json
import os
import sys

import numpy as np
import psycopg2
from psycopg2.extras import Json


def normalize_ranking(row):
    """Compress gaps: [0, 1, 14, 15] -> [0, 1, 2, 3]"""
    _, normalized = np.unique(row, return_inverse=True)
    return normalized


def compute_schulze(matrix):
    """Run Schulze method on a (num_agents, num_candidates) matrix. Returns 1-indexed social rankings."""
    num_agents, num_candidates = matrix.shape

    # Normalize each row
    for i in range(num_agents):
        matrix[i] = normalize_ranking(matrix[i])

    # Pairwise defeats
    defeats = np.zeros((num_candidates, num_candidates), dtype=np.int32)
    for c in range(num_agents):
        for i in range(num_candidates):
            for j in range(num_candidates):
                if matrix[c, i] < matrix[c, j]:
                    defeats[i, j] += 1

    # Strongest paths (Floyd-Warshall)
    paths = np.zeros((num_candidates, num_candidates), dtype=np.int32)
    for i in range(num_candidates):
        for j in range(num_candidates):
            if i != j and defeats[i, j] > defeats[j, i]:
                paths[i, j] = defeats[i, j]

    for k in range(num_candidates):
        for i in range(num_candidates):
            if i != k:
                for j in range(num_candidates):
                    if i != j and k != j:
                        paths[i, j] = max(paths[i, j], min(paths[i, k], paths[k, j]))

    # Rank from paths
    dominance = (paths - paths.T) >= 0
    counts = dominance.sum(axis=1)
    _, rankings = np.unique(-1 * counts, return_inverse=True)

    # TBRC tie-breaking with seed=42
    rng = np.random.default_rng(42)
    if np.unique(rankings).size < rankings.size:
        shuffled = matrix.copy()
        rng.shuffle(shuffled)
        for ballot in shuffled:
            combined = normalize_ranking(rankings) * len(rankings) + normalize_ranking(ballot)
            rankings = normalize_ranking(combined)
            if np.unique(rankings).size == rankings.size:
                break
        else:
            random_ballot = np.arange(rankings.size)
            rng.shuffle(random_ballot)
            combined = normalize_ranking(rankings) * len(rankings) + normalize_ranking(random_ballot)
            rankings = normalize_ranking(combined)

    # Convert to 1-indexed
    return {i: int(rankings[i]) + 1 for i in range(num_candidates)}


def repair(db_url, commit=False):
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Find deliberations with evicted statements
    cur.execute("""
        SELECT d.id, d.question,
               COUNT(*) FILTER (WHERE s.is_evicted = true) AS evicted,
               COUNT(*) FILTER (WHERE s.is_evicted = false) AS active,
               COUNT(*) AS total
        FROM deliberations d
        JOIN statements s ON s.deliberation_id = d.id
        GROUP BY d.id, d.question
        HAVING COUNT(*) FILTER (WHERE s.is_evicted = true) > 0
        ORDER BY evicted DESC
    """)
    affected = cur.fetchall()

    if not affected:
        print("No deliberations with evicted statements found. Nothing to repair.")
        conn.close()
        return

    print(f"Found {len(affected)} deliberation(s) with evicted statements:\n")
    for delib_id, question, evicted, active, total in affected:
        print(f"  {str(delib_id)[:8]}... {question[:60]}")
        print(f"    Statements: {total} total, {evicted} evicted, {active} active")

    print()

    for delib_id, question, evicted_count, active_count, total_count in affected:
        print(f"{'='*70}")
        print(f"Repairing: {question[:60]}")
        print(f"  Deliberation ID: {delib_id}")
        print()

        # Step 1: Un-evict all statements
        print(f"  Step 1: Un-evicting {evicted_count} statements...")
        if commit:
            cur.execute(
                "UPDATE statements SET is_evicted = false WHERE deliberation_id = %s AND is_evicted = true",
                (delib_id,)
            )
            print(f"    -> Updated {cur.rowcount} rows")
        else:
            print(f"    -> Would update {evicted_count} rows (dry run)")

        # Step 2: Get all statement IDs for this deliberation
        cur.execute(
            "SELECT id::text FROM statements WHERE deliberation_id = %s ORDER BY generated_at",
            (delib_id,)
        )
        all_stmt_ids = [r[0] for r in cur.fetchall()]
        stmt_id_set = set(all_stmt_ids)
        id_to_col = {sid: idx for idx, sid in enumerate(all_stmt_ids)}

        print(f"  Step 2: Cleaning rankings ({total_count} statements in scope)...")

        # Step 3: Clean rankings — remove orphaned entries, re-number contiguously
        cur.execute(
            "SELECT id, agent_id, statement_rankings FROM rankings WHERE deliberation_id = %s",
            (delib_id,)
        )
        rankings_rows = cur.fetchall()
        cleaned_count = 0
        matrix = np.zeros((len(rankings_rows), len(all_stmt_ids)), dtype=np.int32)

        for row_idx, (ranking_id, agent_id, sr) in enumerate(rankings_rows):
            entries = sr if isinstance(sr, list) else json.loads(sr)

            # Filter to only valid statement IDs and sort by rank
            valid = sorted(
                [e for e in entries if e["statement_id"] in stmt_id_set],
                key=lambda e: e["rank"]
            )

            # Re-number contiguously
            cleaned = []
            for i, entry in enumerate(valid):
                cleaned.append({
                    "statement_id": entry["statement_id"],
                    "rank": i + 1,
                    **({"is_predicted": True} if entry.get("is_predicted") else {}),
                })

            # Fill matrix for Schulze
            for entry in cleaned:
                col = id_to_col.get(entry["statement_id"])
                if col is not None:
                    matrix[row_idx, col] = entry["rank"] - 1

            if len(cleaned) != len(entries) or any(c["rank"] != e["rank"] for c, e in zip(cleaned, entries)):
                cleaned_count += 1
                if commit:
                    cur.execute(
                        "UPDATE rankings SET statement_rankings = %s WHERE id = %s",
                        (Json(cleaned), ranking_id)
                    )

        print(f"    -> {'Updated' if commit else 'Would update'} {cleaned_count}/{len(rankings_rows)} rankings")

        # Step 4: Recompute Schulze
        print(f"  Step 3: Computing Schulze ({len(rankings_rows)} agents, {len(all_stmt_ids)} statements)...")

        if len(rankings_rows) == 0:
            print("    -> No rankings, skipping Schulze")
            continue

        social_rankings = compute_schulze(matrix)

        # Show top 5
        ranked_stmts = sorted(social_rankings.items(), key=lambda x: x[1])
        cur.execute(
            "SELECT id::text, title, social_ranking FROM statements WHERE deliberation_id = %s ORDER BY generated_at",
            (delib_id,)
        )
        stmt_info = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

        print(f"    Top 5 (new Schulze):")
        for col_idx, new_rank in ranked_stmts[:5]:
            sid = all_stmt_ids[col_idx]
            title, old_rank = stmt_info.get(sid, ("?", None))
            old_str = f"#{old_rank}" if old_rank else "NULL"
            print(f"      #{new_rank} (was {old_str}): {(title or '?')[:50]}")

        # Update social_ranking in DB
        if commit:
            for col_idx, new_rank in social_rankings.items():
                sid = all_stmt_ids[col_idx]
                cur.execute(
                    "UPDATE statements SET social_ranking = %s WHERE id = %s",
                    (new_rank, sid)
                )
            print(f"    -> Updated social_ranking for {len(all_stmt_ids)} statements")
        else:
            print(f"    -> Would update social_ranking for {len(all_stmt_ids)} statements (dry run)")

        print()

    if commit:
        conn.commit()
        print("All changes committed.")
    else:
        conn.rollback()
        print("DRY RUN — no changes made. Run with --commit to apply.")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Repair evicted statement data corruption")
    parser.add_argument("--commit", action="store_true", help="Actually write changes (default is dry run)")
    args = parser.parse_args()

    db_url = os.environ.get("PRODUCTION_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        # Try loading from .env
        env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("PRODUCTION_DATABASE_URL="):
                        db_url = line.split("=", 1)[1].strip().strip('"')
                        break

    if not db_url:
        print("Error: Set PRODUCTION_DATABASE_URL or DATABASE_URL environment variable")
        sys.exit(1)

    repair(db_url, commit=args.commit)
