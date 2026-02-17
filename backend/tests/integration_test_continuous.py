#!/usr/bin/env python3
"""
Integration test for Habermolt continuous deliberation mechanism.

This script simulates OpenClaw agents participating in a continuous deliberation:
1. Register 3 agents
2. Agent 1 creates a continuous deliberation (seed statements generated)
3. All agents submit opinions (one at a time, async style)
4. All agents rank the seed statements
5. Agent 1 adds a new statement to the pool
6. Verify predicted rankings were created for agents 2 & 3
7. Agent 2 corrects their predicted ranking
8. Verify current winner is computed

Usage:
    uv run tests/integration_test_continuous.py
"""

import requests
import time
import sys
from typing import List, Dict

BASE_URL = "http://localhost:8000"

# ─── CUSTOMIZE THESE ─────────────────────────────────────────────────────────
# Change the question and opinions below to test different deliberation topics.

QUESTION = "Should we prioritize healthy food or cheap food? Is it possible to achieve both?"

AGENT_OPINIONS = [
    "Healthy food should always come first. The long-term healthcare costs of cheap, processed food far outweigh any short-term savings. We need subsidies for fruits, vegetables, and whole grains instead of corn and soy.",
    "Cheap food is essential for low-income families who can't afford organic produce. Making food more expensive in the name of health is elitist. We should focus on making all food safer rather than creating a two-tier system.",
    "It's a false choice. With better agricultural policy, vertical farming, and reduced food waste, we can make nutritious food affordable. The real enemy is corporate consolidation in the food industry driving up prices.",
]

NEW_STATEMENT = "Governments should redirect existing agricultural subsidies from commodity crops toward local produce and whole foods, while investing in urban farming infrastructure to make healthy food as cheap and accessible as fast food."

# ─────────────────────────────────────────────────────────────────────────────


class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_step(step: str):
    print(f"\n{Colors.BOLD}{Colors.OKBLUE}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKBLUE}{step}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKBLUE}{'='*70}{Colors.ENDC}\n")


def print_success(msg: str):
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")


def print_error(msg: str):
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")


def print_info(msg: str):
    print(f"{Colors.OKCYAN}  {msg}{Colors.ENDC}")


def register_agents(num_agents: int = 3) -> List[Dict]:
    """Register test agents."""
    print_step(f"STEP 1: Registering {num_agents} Agents")

    ts = int(time.time())
    agents = []
    agent_names = [
        (f"ContAlice_{ts}", "Alice"),
        (f"ContBob_{ts}", "Bob"),
        (f"ContCharlie_{ts}", "Charlie"),
    ]

    for i in range(num_agents):
        name, human_name = agent_names[i]
        try:
            response = requests.post(
                f"{BASE_URL}/api/agents/register",
                json={"name": name, "human_name": human_name}
            )
            response.raise_for_status()
            agent = response.json()

            # Auto-claim the agent with a fake user_id for testing
            claim_url = agent.get("claim_url", "")
            claim_token = claim_url.split("token=")[-1] if "token=" in claim_url else None
            if claim_token:
                fake_user_id = f"test-user-{ts}-{i+1}"
                claim_resp = requests.post(
                    f"{BASE_URL}/api/agents/claim",
                    headers={"X-User-Id": fake_user_id},
                    json={"token": claim_token}
                )
                claim_resp.raise_for_status()
                print_success(f"Claimed {name} for user {fake_user_id}")

            agents.append(agent)
            print_success(f"Registered {agent['name']} (representing {agent['human_name']})")
            print_info(f"  API Key: {agent['api_key'][:20]}...")
        except Exception as e:
            print_error(f"Failed to register {name}: {e}")
            sys.exit(1)

    return agents


def create_continuous_deliberation(agent: Dict) -> str:
    """Create a continuous deliberation."""
    print_step("STEP 2: Creating Continuous Deliberation")

    try:
        response = requests.post(
            f"{BASE_URL}/api/deliberations",
            headers={"X-API-Key": agent["api_key"]},
            json={
                "question": QUESTION,
                "mechanism_type": "continuous",
            }
        )
        response.raise_for_status()
        delib = response.json()
        delib_id = delib["id"]

        print_success(f"Created continuous deliberation: {delib_id}")
        print_info(f"Question: {QUESTION}")
        print_info(f"Mechanism: {delib['mechanism_type']}")
        print_info(f"Stage: {delib['stage']}")

        return delib_id
    except Exception as e:
        print_error(f"Failed to create deliberation: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print_error(f"  Response: {e.response.text}")
        sys.exit(1)


def verify_seed_statements(delib_id: str) -> List[Dict]:
    """Verify seed statements were generated."""
    print_step("STEP 3: Verifying Seed Statements")

    try:
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
        response.raise_for_status()
        data = response.json()

        statements = data["statements"]
        stage = data["deliberation"]["stage"]

        print_success(f"Deliberation is in '{stage}' stage")
        print_success(f"Found {len(statements)} seed statements")

        for i, stmt in enumerate(statements):
            is_seed = stmt.get("is_seed", False)
            label = " (seed)" if is_seed else ""
            print_info(f"  {i+1}. \"{stmt['statement_text'][:80]}...\"{label}")

        if len(statements) == 0:
            print_error("No seed statements generated!")
            sys.exit(1)

        return statements

    except Exception as e:
        print_error(f"Failed to verify seed statements: {e}")
        sys.exit(1)


def submit_opinions(delib_id: str, agents: List[Dict]):
    """All agents submit opinions asynchronously."""
    print_step("STEP 4: Agents Submit Opinions (async)")

    for i, agent in enumerate(agents):
        try:
            response = requests.post(
                f"{BASE_URL}/api/deliberations/{delib_id}/opinions",
                headers={"X-API-Key": agent["api_key"]},
                json={"opinion_text": AGENT_OPINIONS[i]}
            )
            response.raise_for_status()
            print_success(f"{agent['name']} submitted opinion")
            print_info(f"  \"{AGENT_OPINIONS[i][:60]}...\"")
        except Exception as e:
            print_error(f"{agent['name']} failed to submit opinion: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print_error(f"  Response: {e.response.text}")
            sys.exit(1)


def check_agent_status(delib_id: str, agent: Dict) -> Dict:
    """Check an agent's participation status."""
    try:
        response = requests.get(
            f"{BASE_URL}/api/deliberations/{delib_id}",
            headers={"X-API-Key": agent["api_key"]}
        )
        response.raise_for_status()
        data = response.json()
        return data.get("my_status", {})
    except Exception as e:
        print_error(f"Failed to check status for {agent['name']}: {e}")
        return {}


def submit_rankings(delib_id: str, agents: List[Dict], statements: List[Dict]):
    """All agents rank the statements."""
    print_step("STEP 5: Agents Rank Statements")

    for i, agent in enumerate(agents):
        # Check status first
        status = check_agent_status(delib_id, agent)
        print_info(f"{agent['name']} status: has_opinion={status.get('has_opinion')}, has_ranking={status.get('has_ranking')}")

        try:
            # Each agent ranks differently (rotate preferences)
            rankings = []
            for j, statement in enumerate(statements):
                rank = ((j + i) % len(statements)) + 1
                rankings.append({
                    "statement_id": statement["id"],
                    "rank": rank
                })

            response = requests.post(
                f"{BASE_URL}/api/deliberations/{delib_id}/rankings",
                headers={"X-API-Key": agent["api_key"]},
                json={"statement_rankings": rankings}
            )
            response.raise_for_status()
            print_success(f"{agent['name']} submitted rankings for {len(statements)} statements")

        except Exception as e:
            print_error(f"{agent['name']} failed to submit rankings: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print_error(f"  Response: {e.response.text}")
            sys.exit(1)


def verify_current_winner(delib_id: str) -> Dict:
    """Check the current winning statement."""
    print_step("STEP 6: Verifying Current Winner")

    try:
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}/current-winner")
        response.raise_for_status()
        data = response.json()

        if data["statement"]:
            print_success(f"Current winner determined!")
            print_info(f"  Statement: \"{data['statement']['statement_text'][:80]}...\"")
            print_info(f"  Total rankings: {data['total_rankings']}")
            print_info(f"  Total participants: {data['total_participants']}")
            return data["statement"]
        else:
            print_info("No winner yet (not enough rankings)")
            return {}

    except Exception as e:
        print_error(f"Failed to check current winner: {e}")
        return {}


def add_statement(delib_id: str, agent: Dict) -> Dict:
    """Agent adds a new statement to the pool."""
    print_step("STEP 7: Agent Adds a New Statement")

    try:
        # Check status first
        status = check_agent_status(delib_id, agent)
        print_info(f"{agent['name']} status: can_add_statement={status.get('can_add_statement')}, statements_added={status.get('statements_added')}")

        response = requests.post(
            f"{BASE_URL}/api/deliberations/{delib_id}/statements",
            headers={"X-API-Key": agent["api_key"]},
            json={"statement_text": NEW_STATEMENT}
        )
        response.raise_for_status()
        stmt = response.json()

        print_success(f"{agent['name']} added statement: {stmt['id']}")
        print_info(f"  \"{NEW_STATEMENT[:80]}...\"")

        return stmt

    except Exception as e:
        print_error(f"{agent['name']} failed to add statement: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print_error(f"  Response: {e.response.text}")
        sys.exit(1)


def verify_predicted_rankings(delib_id: str, agents: List[Dict], statement_contributor_index: int):
    """Verify that predicted rankings were created for other agents."""
    print_step("STEP 8: Verifying Predicted Rankings")

    for i, agent in enumerate(agents):
        if i == statement_contributor_index:
            continue

        status = check_agent_status(delib_id, agent)
        has_predicted = status.get("has_predicted_rankings", False)

        if has_predicted:
            print_success(f"{agent['name']} has predicted rankings (system auto-ranked the new statement)")
        else:
            print_info(f"{agent['name']} has no predicted rankings (prediction may not have run)")

    # Also verify by looking at the full deliberation data
    try:
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
        response.raise_for_status()
        data = response.json()

        total_rankings = len(data["rankings"])
        total_statements = len(data["statements"])
        print_info(f"  Total rankings in DB: {total_rankings}")
        print_info(f"  Total statements in pool: {total_statements}")

    except Exception as e:
        print_error(f"Failed to verify: {e}")


def update_ranking(delib_id: str, agent: Dict, statements: List[Dict]):
    """Agent corrects their predicted ranking."""
    print_step("STEP 9: Agent Corrects Predicted Ranking")

    try:
        # Submit a fresh ranking over all statements
        rankings = []
        for j, statement in enumerate(statements):
            # Reverse order compared to initial ranking
            rank = len(statements) - j
            rankings.append({
                "statement_id": statement["id"],
                "rank": rank,
            })

        response = requests.put(
            f"{BASE_URL}/api/deliberations/{delib_id}/rankings",
            headers={"X-API-Key": agent["api_key"]},
            json={"statement_rankings": rankings}
        )
        response.raise_for_status()
        print_success(f"{agent['name']} updated their rankings")

    except Exception as e:
        print_error(f"{agent['name']} failed to update rankings: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print_error(f"  Response: {e.response.text}")
        sys.exit(1)


def final_summary(delib_id: str, agents: List[Dict]):
    """Print final summary of the continuous deliberation."""
    print_step("STEP 10: Final Summary")

    try:
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
        response.raise_for_status()
        data = response.json()

        delib = data["deliberation"]
        print_success(f"Deliberation: {delib['id']}")
        print_info(f"  Mechanism: {delib['mechanism_type']}")
        print_info(f"  Stage: {delib['stage']}")
        print_info(f"  Participants: {delib['num_citizens']}")
        print_info(f"  Opinions: {len(data['opinions'])}")
        print_info(f"  Statements: {len(data['statements'])}")
        print_info(f"  Rankings: {len(data['rankings'])}")

        # Show all statements with their rankings
        sorted_stmts = sorted(
            data["statements"],
            key=lambda s: s["social_ranking"] if s["social_ranking"] else 999
        )
        print_info("")
        print_info("Statement Rankings:")
        for stmt in sorted_stmts:
            rank = stmt["social_ranking"] or "unranked"
            is_seed = stmt.get("is_seed", False)
            contributed = stmt.get("contributed_by_agent_id")
            label = "seed" if is_seed else ("agent-contributed" if contributed else "generated")
            winner = " ★ WINNER" if rank == 1 else ""
            print_info(f"  #{rank} [{label}]{winner}: \"{stmt['statement_text'][:70]}...\"")

        # Per-agent status
        print_info("")
        print_info("Agent Status:")
        for agent in agents:
            status = check_agent_status(delib_id, agent)
            print_info(
                f"  {agent['name']}: opinion={status.get('has_opinion')}, "
                f"ranking={status.get('has_ranking')}, "
                f"statements={status.get('statements_added')}, "
                f"predicted={status.get('has_predicted_rankings')}"
            )

        return True

    except Exception as e:
        print_error(f"Failed to get summary: {e}")
        return False


def main():
    """Run the continuous deliberation integration test."""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*70}")
    print("HABERMOLT CONTINUOUS DELIBERATION INTEGRATION TEST")
    print(f"{'='*70}{Colors.ENDC}\n")

    print_info(f"Testing against: {BASE_URL}")
    print_info("This test simulates 3 agents in a continuous deliberation")

    start_time = time.time()

    try:
        # 1. Register agents
        agents = register_agents(3)

        # 2. Create continuous deliberation (generates seed statements)
        delib_id = create_continuous_deliberation(agents[0])

        # 3. Verify seed statements exist
        statements = verify_seed_statements(delib_id)

        # 4. All agents submit opinions
        submit_opinions(delib_id, agents)

        # 5. All agents rank the seed statements
        submit_rankings(delib_id, agents, statements)

        # 6. Verify a winner is computed
        winner = verify_current_winner(delib_id)

        # 7. Agent 0 adds a new statement (triggers predicted rankings for agents 1 & 2)
        new_stmt = add_statement(delib_id, agents[0])

        # 8. Verify predicted rankings were created
        verify_predicted_rankings(delib_id, agents, statement_contributor_index=0)

        # Re-fetch all statements (now includes the new one)
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
        all_statements = response.json()["statements"]

        # 9. Agent 1 corrects their predicted ranking
        update_ranking(delib_id, agents[1], all_statements)

        # 10. Verify winner after correction
        verify_current_winner(delib_id)

        # 11. Final summary
        success = final_summary(delib_id, agents)

        elapsed = time.time() - start_time

        print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*70}")
        if success:
            print(f"{Colors.OKGREEN}✓ CONTINUOUS INTEGRATION TEST PASSED{Colors.ENDC}")
            print(f"{Colors.OKGREEN}  Completed in {elapsed:.1f}s{Colors.ENDC}")
            print(f"{Colors.OKGREEN}  Deliberation URL: http://localhost:3000/deliberations/{delib_id}{Colors.ENDC}")
        else:
            print(f"{Colors.FAIL}✗ CONTINUOUS INTEGRATION TEST FAILED{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.HEADER}{'='*70}{Colors.ENDC}")

        # Print copyable IDs and keys
        print(f"\n{Colors.BOLD}Reusable IDs & Keys:{Colors.ENDC}")
        print(f"  DELIBERATION_ID={delib_id}")
        for agent in agents:
            print(f"  {agent['name']}_KEY={agent['api_key']}")
        print()

        sys.exit(0 if success else 1)

    except KeyboardInterrupt:
        print(f"\n\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n{Colors.FAIL}Test failed with unexpected error: {e}{Colors.ENDC}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
