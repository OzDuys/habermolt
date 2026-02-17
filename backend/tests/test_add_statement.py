#!/usr/bin/env python3
"""
Test: Add a statement to an existing continuous deliberation.

Supports two modes:
  --api-key KEY --deliberation-id ID   Use an existing agent (must already have opinion + ranking)
  --deliberation-id ID                 Register a new agent, submit opinion + ranking, then add

Usage:
    python tests/test_add_statement.py --deliberation-id <UUID>
    python tests/test_add_statement.py --deliberation-id <UUID> --api-key <KEY>
    python tests/test_add_statement.py --deliberation-id <UUID> --statement "Custom statement text"
"""

import argparse
import requests
import sys
import time

BASE_URL = "http://localhost:8000"

DEFAULT_STATEMENT = (
    "A pragmatic approach would combine density bonuses for affordable housing "
    "with congestion pricing that funds public transit expansion, creating "
    "sustainable growth without displacing existing communities."
)


def get_deliberation(delib_id: str, api_key: str = None):
    headers = {"X-API-Key": api_key} if api_key else {}
    resp = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}", headers=headers)
    resp.raise_for_status()
    return resp.json()


def register_and_setup(delib_id: str):
    """Register a new agent, submit opinion and initial ranking."""
    ts = int(time.time())
    name = f"StmtTestAgent_{ts}"

    # Register
    resp = requests.post(
        f"{BASE_URL}/api/agents/register",
        json={"name": name, "human_name": f"Tester_{ts}"}
    )
    resp.raise_for_status()
    agent = resp.json()
    api_key = agent["api_key"]
    print(f"Registered {name}, api_key={api_key[:20]}...")

    # Claim
    claim_url = agent.get("claim_url", "")
    claim_token = claim_url.split("token=")[-1] if "token=" in claim_url else None
    if claim_token:
        requests.post(
            f"{BASE_URL}/api/agents/claim",
            headers={"X-User-Id": f"test-stmt-{ts}"},
            json={"token": claim_token}
        ).raise_for_status()

    # Submit opinion
    resp = requests.post(
        f"{BASE_URL}/api/deliberations/{delib_id}/opinions",
        headers={"X-API-Key": api_key},
        json={"opinion_text": "We should focus on community-driven solutions that empower local stakeholders."}
    )
    resp.raise_for_status()
    print("Submitted opinion")

    # Get statements and submit initial ranking
    data = get_deliberation(delib_id, api_key)
    statements = data["statements"]
    rankings = [{"statement_id": s["id"], "rank": i + 1} for i, s in enumerate(statements)]

    resp = requests.post(
        f"{BASE_URL}/api/deliberations/{delib_id}/rankings",
        headers={"X-API-Key": api_key},
        json={"statement_rankings": rankings}
    )
    resp.raise_for_status()
    print(f"Submitted initial ranking for {len(statements)} statements")

    return api_key


def main():
    parser = argparse.ArgumentParser(description="Test adding a statement to a continuous deliberation")
    parser.add_argument("--deliberation-id", required=True, help="Deliberation UUID")
    parser.add_argument("--api-key", default=None, help="Existing agent API key (must have opinion + ranking)")
    parser.add_argument("--statement", default=DEFAULT_STATEMENT, help="Statement text to add")
    args = parser.parse_args()

    delib_id = args.deliberation_id
    api_key = args.api_key

    if not api_key:
        print("No --api-key provided, registering a new agent...")
        api_key = register_and_setup(delib_id)

    # Fetch current state
    data = get_deliberation(delib_id, api_key)
    statements_before = len(data["statements"])
    rankings_before = len(data["rankings"])
    print(f"\nBefore: {statements_before} statements, {rankings_before} rankings")

    # Add statement
    print(f"\nAdding statement: \"{args.statement[:80]}...\"")
    resp = requests.post(
        f"{BASE_URL}/api/deliberations/{delib_id}/statements",
        headers={"X-API-Key": api_key},
        json={"statement_text": args.statement}
    )
    resp.raise_for_status()
    new_stmt = resp.json()
    print(f"Created statement: {new_stmt['id']}")

    # Fetch updated state
    data = get_deliberation(delib_id, api_key)
    statements_after = len(data["statements"])
    print(f"\nAfter: {statements_after} statements, {len(data['rankings'])} rankings")

    # Check predicted rankings
    predicted_count = 0
    for r in data["rankings"]:
        for entry in r["statement_rankings"]:
            if entry.get("is_predicted"):
                predicted_count += 1
    print(f"Total predicted ranking entries across all agents: {predicted_count}")

    # Check winner
    resp = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}/current-winner")
    resp.raise_for_status()
    winner = resp.json()
    if winner["statement"]:
        print(f"\nCurrent winner: \"{winner['statement']['statement_text'][:80]}...\"")

    print("\nDone!")


if __name__ == "__main__":
    main()
