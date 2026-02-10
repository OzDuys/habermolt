#!/usr/bin/env python3
"""
Integration test for Habermolt platform - Full deliberation flow with 3 agents.

This script simulates OpenClaw agents participating in a deliberation:
1. Register 3 agents
2. Create a deliberation
3. All agents submit opinions
4. Wait for Habermas Machine to generate statements
5. All agents rank the generated statements
6. All agents critique the winning statement
7. All agents submit human feedback
8. Verify deliberation reaches FINALIZED stage

Usage:
    python scripts/integration_test.py
"""

import requests
import time
import sys
from typing import List, Dict

BASE_URL = "http://localhost:8000"

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
    """Print a step header."""
    print(f"\n{Colors.BOLD}{Colors.OKBLUE}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKBLUE}{step}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.OKBLUE}{'='*70}{Colors.ENDC}\n")


def print_success(msg: str):
    """Print success message."""
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")


def print_error(msg: str):
    """Print error message."""
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")


def print_info(msg: str):
    """Print info message."""
    print(f"{Colors.OKCYAN}  {msg}{Colors.ENDC}")


def register_agents(num_agents: int = 3) -> List[Dict]:
    """Register test agents."""
    print_step(f"STEP 1: Registering {num_agents} Agents")

    agents = []
    agent_names = [
        ("AliceAgent", "Alice"),
        ("BobAgent", "Bob"),
        ("CharlieAgent", "Charlie"),
        ("DaveAgent", "Dave"),
        ("EveAgent", "Eve")
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
            agents.append(agent)
            print_success(f"Registered {agent['name']} (representing {agent['human_name']})")
            print_info(f"  API Key: {agent['api_key'][:20]}...")
        except Exception as e:
            print_error(f"Failed to register {name}: {e}")
            sys.exit(1)

    return agents


def create_deliberation(agent: Dict) -> str:
    """Create a deliberation."""
    print_step("STEP 2: Creating Deliberation")

    question = "Should we implement universal basic income for all citizens?"

    try:
        response = requests.post(
            f"{BASE_URL}/api/deliberations",
            headers={"X-API-Key": agent["api_key"]},
            json={
                "question": question,
                "num_critique_rounds": 1
            }
        )
        response.raise_for_status()
        delib = response.json()
        delib_id = delib["id"]

        print_success(f"Created deliberation: {delib_id}")
        print_info(f"Question: {question}")
        print_info(f"Join window: 5 minutes after 2+ participants")
        print_info(f"Current stage: {delib['stage']}")

        return delib_id
    except Exception as e:
        print_error(f"Failed to create deliberation: {e}")
        sys.exit(1)


def submit_opinions(delib_id: str, agents: List[Dict]):
    """All agents submit their opinions."""
    print_step("STEP 3: Submitting Opinions")

    opinions = [
        "UBI would provide economic security and reduce poverty. It gives people freedom to pursue meaningful work without fear of destitution. Studies in Finland and Kenya show positive outcomes.",
        "UBI is economically unsustainable and would discourage work. We should focus on job creation and skills training instead. The cost would require massive tax increases.",
        "UBI should be tested through pilot programs first. We need more data on its long-term effects on work incentives, inflation, and social cohesion before nationwide implementation."
    ]

    for i, agent in enumerate(agents):
        try:
            response = requests.post(
                f"{BASE_URL}/api/deliberations/{delib_id}/opinions",
                headers={"X-API-Key": agent["api_key"]},
                json={"opinion_text": opinions[i]}
            )
            response.raise_for_status()
            print_success(f"{agent['name']} submitted opinion")
            print_info(f"  \"{opinions[i][:60]}...\"")
        except Exception as e:
            print_error(f"{agent['name']} failed to submit opinion: {e}")
            sys.exit(1)


def start_deliberation(delib_id: str, creator_agent: Dict):
    """Creator starts the deliberation early (skips 5-min join window)."""
    print_step("STEP 3.5: Starting Deliberation (creator skips join window)")

    try:
        response = requests.post(
            f"{BASE_URL}/api/deliberations/{delib_id}/start",
            headers={"X-API-Key": creator_agent["api_key"]}
        )
        response.raise_for_status()
        print_success("Creator started the deliberation")
    except Exception as e:
        print_error(f"Failed to start deliberation: {e}")
        sys.exit(1)


def wait_for_statements(delib_id: str, timeout: int = 120):
    """Wait for Habermas Machine to generate statements."""
    print_step("STEP 4: Waiting for Habermas Machine")

    print_info("Habermas Machine is generating group statements...")
    print_info("This typically takes 30-60 seconds...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
            response.raise_for_status()
            data = response.json()

            stage = data["deliberation"]["stage"]
            num_statements = len(data["statements"])

            if stage == "ranking" and num_statements > 0:
                print_success(f"Habermas Machine completed! Generated {num_statements} statements")
                return data["statements"]

            elapsed = int(time.time() - start_time)
            print(f"  {elapsed}s elapsed, stage: {stage}, statements: {num_statements}", end="\r")
            time.sleep(3)

        except Exception as e:
            print_error(f"Error checking deliberation status: {e}")
            time.sleep(5)

    print_error(f"Timeout waiting for statements after {timeout}s")
    sys.exit(1)


def submit_rankings(delib_id: str, agents: List[Dict], statements: List[Dict]):
    """All agents rank the generated statements."""
    print_step("STEP 5: Ranking Statements")

    print_info(f"Agents are ranking {len(statements)} generated statements...")

    for i, agent in enumerate(agents):
        try:
            # Create rankings (simulate agent preference - each agent ranks differently)
            # In real scenario, agents would analyze statements and rank based on human preferences
            rankings = []
            for j, statement in enumerate(statements):
                # Rotate ranking order for each agent to simulate different preferences
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
            print_success(f"{agent['name']} submitted rankings")

        except Exception as e:
            print_error(f"{agent['name']} failed to submit rankings: {e}")
            sys.exit(1)


def wait_for_winner(delib_id: str, timeout: int = 60):
    """Wait for social choice to determine winner."""
    print_step("STEP 6: Determining Winner via Social Choice")

    print_info("Schulze method is aggregating rankings...")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
            response.raise_for_status()
            data = response.json()

            stage = data["deliberation"]["stage"]

            if stage == "critique":
                winner = next((s for s in data["statements"] if s["social_ranking"] == 1), None)
                if winner:
                    print_success("Winner determined!")
                    print_info(f"  Winning statement: \"{winner['statement_text'][:80]}...\"")
                    return winner

            time.sleep(2)

        except Exception as e:
            print_error(f"Error checking winner: {e}")
            time.sleep(3)

    print_error(f"Timeout waiting for winner after {timeout}s")
    sys.exit(1)


def submit_critiques(delib_id: str, agents: List[Dict], winner: Dict):
    """All agents critique the winning statement."""
    print_step("STEP 7: Submitting Critiques")

    critiques = [
        "The winning statement balances economic concerns with social welfare, but needs more specifics on funding mechanisms and implementation timeline.",
        "While this statement finds middle ground, it may be too cautious. We should be bolder about economic redistribution given the growing inequality crisis.",
        "This consensus statement is reasonable but doesn't address potential inflationary effects or how to prevent work disincentive issues."
    ]

    for i, agent in enumerate(agents):
        try:
            response = requests.post(
                f"{BASE_URL}/api/deliberations/{delib_id}/critiques",
                headers={"X-API-Key": agent["api_key"]},
                json={"critique_text": critiques[i]}
            )
            response.raise_for_status()
            print_success(f"{agent['name']} submitted critique")

        except Exception as e:
            print_error(f"{agent['name']} failed to submit critique: {e}")
            sys.exit(1)


def wait_for_concluded(delib_id: str, timeout: int = 60):
    """Wait for deliberation to reach concluded stage."""
    print_step("STEP 8: Waiting for Deliberation to Conclude")

    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
            response.raise_for_status()
            data = response.json()

            stage = data["deliberation"]["stage"]

            if stage == "concluded":
                print_success("Deliberation concluded! Ready for human feedback")
                return data

            time.sleep(2)

        except Exception as e:
            print_error(f"Error checking status: {e}")
            time.sleep(3)

    print_error(f"Timeout waiting for concluded stage after {timeout}s")
    sys.exit(1)


def submit_feedback(delib_id: str, agents: List[Dict]):
    """All agents submit human feedback."""
    print_step("STEP 9: Submitting Human Feedback")

    feedback_data = [
        (4, "I mostly agree with this consensus. It captures my concerns about economic security while acknowledging implementation challenges."),
        (3, "Neutral. The statement is reasonable but lacks the bold vision I was hoping for. It feels like a safe compromise."),
        (5, "Strongly agree. This statement reflects my views well and represents a balanced approach to UBI implementation.")
    ]

    for i, agent in enumerate(agents):
        agreement_level, feedback_text = feedback_data[i]
        try:
            response = requests.post(
                f"{BASE_URL}/api/deliberations/{delib_id}/feedback",
                headers={"X-API-Key": agent["api_key"]},
                json={
                    "agreement_level": agreement_level,
                    "feedback_text": feedback_text
                }
            )
            response.raise_for_status()
            print_success(f"{agent['name']}'s human: Agreement level {agreement_level}/5")

        except Exception as e:
            print_error(f"{agent['name']} failed to submit feedback: {e}")
            sys.exit(1)


def verify_finalized(delib_id: str):
    """Verify deliberation reached finalized stage."""
    print_step("STEP 10: Verifying Finalization")

    try:
        response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}")
        response.raise_for_status()
        data = response.json()

        stage = data["deliberation"]["stage"]

        if stage == "finalized":
            print_success("Deliberation successfully finalized!")

            # Calculate consensus metrics
            feedbacks = data["human_feedback"]
            avg_agreement = sum(f["agreement_level"] for f in feedbacks) / len(feedbacks)

            print_info(f"  Average human agreement: {avg_agreement:.1f}/5.0")
            print_info(f"  Total opinions: {len(data['opinions'])}")
            print_info(f"  Total statements generated: {len(data['statements'])}")
            print_info(f"  Total critiques: {len(data['critiques'])}")
            print_info(f"  Total feedback submissions: {len(feedbacks)}")

            # Get result details
            result_response = requests.get(f"{BASE_URL}/api/deliberations/{delib_id}/result")
            result_response.raise_for_status()
            result = result_response.json()

            # Get the final winning statement (highest round_number, social_ranking = 1)
            statements = result['statements']
            final_statement = max(
                (s for s in statements if s['social_ranking'] == 1),
                key=lambda s: s['round_number']
            )

            print_success("\nFinal Consensus Statement:")
            print(f"\n{Colors.BOLD}{final_statement['statement_text'][:200]}...{Colors.ENDC}\n")

            return True
        else:
            print_error(f"Deliberation did not finalize. Current stage: {stage}")
            return False

    except Exception as e:
        print_error(f"Error verifying finalization: {e}")
        return False


def main():
    """Run the integration test."""
    print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*70}")
    print("HABERMOLT INTEGRATION TEST")
    print(f"{'='*70}{Colors.ENDC}\n")

    print_info(f"Testing against: {BASE_URL}")
    print_info("This test simulates 3 OpenClaw agents participating in a deliberation")

    start_time = time.time()

    try:
        # Run full deliberation flow
        agents = register_agents(3)
        delib_id = create_deliberation(agents[0])
        submit_opinions(delib_id, agents)
        start_deliberation(delib_id, agents[0])
        statements = wait_for_statements(delib_id)
        submit_rankings(delib_id, agents, statements)
        winner = wait_for_winner(delib_id)
        submit_critiques(delib_id, agents, winner)
        wait_for_concluded(delib_id)
        submit_feedback(delib_id, agents)
        success = verify_finalized(delib_id)

        elapsed = time.time() - start_time

        print(f"\n{Colors.BOLD}{Colors.HEADER}{'='*70}")
        if success:
            print(f"{Colors.OKGREEN}✓ INTEGRATION TEST PASSED{Colors.ENDC}")
            print(f"{Colors.OKGREEN}  All stages completed successfully in {elapsed:.1f}s{Colors.ENDC}")
            print(f"{Colors.OKGREEN}  Deliberation URL: http://localhost:3000/deliberations/{delib_id}{Colors.ENDC}")
        else:
            print(f"{Colors.FAIL}✗ INTEGRATION TEST FAILED{Colors.ENDC}")
            print(f"{Colors.FAIL}  Test completed in {elapsed:.1f}s but deliberation did not finalize{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.HEADER}{'='*70}{Colors.ENDC}\n")

        sys.exit(0 if success else 1)

    except KeyboardInterrupt:
        print(f"\n\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n{Colors.FAIL}Test failed with unexpected error: {e}{Colors.ENDC}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
