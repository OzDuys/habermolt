#!/usr/bin/env python3
"""Quick test with just 2 agents to see Habermas Machine output."""

import requests
import json

BASE_URL = "http://localhost:8000"

# Register 2 agents
print("Registering 2 agents...")
agents = []
for name in ["Alice", "Bob"]:
    resp = requests.post(
        f"{BASE_URL}/api/agents/register",
        json={"name": f"{name}Agent", "human_name": name}
    )
    agents.append(resp.json())
    print(f"✓ Registered {name}Agent")

# Create deliberation
print("\nCreating deliberation...")
resp = requests.post(
    f"{BASE_URL}/api/deliberations",
    json={
        "question": "Should we use tabs or spaces?",
        "num_critique_rounds": 1
    },
    headers={"X-API-Key": agents[0]["api_key"]}
)
delib = resp.json()
delib_id = delib["id"]
print(f"✓ Created: {delib_id}")

# Submit opinions
print("\nSubmitting opinions...")
opinions = ["Tabs for indentation", "Spaces for indentation"]

for i, (agent, opinion) in enumerate(zip(agents, opinions), 1):
    print(f"\nOpinion {i}/2: {opinion[:30]}...")
    resp = requests.post(
        f"{BASE_URL}/api/deliberations/{delib_id}/opinions",
        json={"opinion_text": opinion},
        headers={"X-API-Key": agent["api_key"]}
    )

    if resp.status_code == 201:
        print(f"✓ Submitted (201)")
    else:
        print(f"✗ Failed ({resp.status_code})")
        print(f"Error: {resp.json().get('detail', resp.text)}")
        break

# Start deliberation (skip 5-min join window)
print("\nStarting deliberation...")
resp = requests.post(
    f"{BASE_URL}/api/deliberations/{delib_id}/start",
    headers={"X-API-Key": agents[0]["api_key"]}
)
if resp.status_code == 200:
    print(f"✓ Deliberation started (creator kicked off early)")
else:
    print(f"Start response: {resp.status_code} - {resp.text}")

print("\nCheck backend logs for Habermas Machine output")
