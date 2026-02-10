#!/usr/bin/env python3
"""
Quick test to demonstrate the improved error handling for API quota errors.

This will show a clear error message when the Google API quota is exceeded,
instead of silently failing.
"""

import requests
import json
from colorama import init, Fore, Style

init()

BASE_URL = "http://localhost:8000"

def test_quota_error():
    """Test that quota errors are properly surfaced to users."""

    print(f"\n{Style.BRIGHT}{Fore.MAGENTA}{'='*70}")
    print("QUOTA ERROR HANDLING TEST")
    print(f"{'='*70}{Style.RESET_ALL}\n")

    print(f"{Fore.CYAN}This test demonstrates the improved error handling.{Style.RESET_ALL}")
    print(f"{Fore.CYAN}When Google API quota is exceeded, you'll now see a clear error.{Style.RESET_ALL}\n")

    # Register 3 agents
    print(f"{Style.BRIGHT}{Fore.BLUE}Registering 3 agents...{Style.RESET_ALL}\n")

    agents = []
    for name, human in [("Alice", "Alice"), ("Bob", "Bob"), ("Charlie", "Charlie")]:
        response = requests.post(
            f"{BASE_URL}/api/agents/register",
            json={"name": f"{name}Agent", "human_name": human}
        )
        agent_data = response.json()
        agents.append(agent_data)
        print(f"{Fore.GREEN}✓ Registered {name}Agent{Style.RESET_ALL}")

    # Create deliberation
    print(f"\n{Style.BRIGHT}{Fore.BLUE}Creating deliberation...{Style.RESET_ALL}\n")

    response = requests.post(
        f"{BASE_URL}/api/deliberations",
        json={
            "question": "Should we implement universal basic income?",
            "num_critique_rounds": 1
        },
        headers={"X-API-Key": agents[0]["api_key"]}
    )

    delib = response.json()
    delib_id = delib["id"]
    print(f"{Fore.GREEN}✓ Created deliberation: {delib_id}{Style.RESET_ALL}\n")

    # Submit opinions
    print(f"{Style.BRIGHT}{Fore.BLUE}Submitting opinions...{Style.RESET_ALL}\n")

    opinions = [
        "UBI would provide economic security.",
        "UBI is economically unsustainable.",
        "UBI should be tested through pilots."
    ]

    for i, (agent, opinion) in enumerate(zip(agents, opinions), 1):
        print(f"Opinion {i}/3: ", end="")

        response = requests.post(
            f"{BASE_URL}/api/deliberations/{delib_id}/opinions",
            json={"opinion_text": opinion},
            headers={"X-API-Key": agent["api_key"]}
        )

        if response.status_code == 201:
            print(f"{Fore.GREEN}✓ Submitted{Style.RESET_ALL}")
        elif response.status_code == 503:
            print(f"{Fore.YELLOW}⚠ API Quota Exceeded{Style.RESET_ALL}\n")
            error_detail = response.json().get("detail", "Unknown error")
            print(f"{Fore.RED}{Style.BRIGHT}ERROR:{Style.RESET_ALL}")
            print(f"{Fore.RED}{error_detail}{Style.RESET_ALL}\n")
            return
        else:
            print(f"{Fore.RED}✗ Failed ({response.status_code}){Style.RESET_ALL}")
            print(f"{Fore.RED}{response.text}{Style.RESET_ALL}\n")
            return

    print(f"\n{Fore.GREEN}✓ All opinions submitted successfully!{Style.RESET_ALL}")
    print(f"{Fore.CYAN}(This means you have a working API key with available quota){Style.RESET_ALL}\n")


if __name__ == "__main__":
    test_quota_error()
