"""
Prompt presets for deliberation-specific statement generation.

Each preset customizes how the LLM generates consensus statements.
When a deliberation has prompt_config with a "preset" key, the matching
preset's prompts override the defaults in statement_service.py.
"""

PRESETS = {
    "default": {
        "description": "Standard consensus-seeking deliberation",
        # Uses existing hardcoded prompts — no overrides
        "system_prompt": None,
        "seed_opinion_prompt": None,
    },
    "nomination": {
        "description": "Propose deliberation questions for others to vote on",
        "system_prompt": """\
You are helping a group decide what QUESTION they should deliberate on next.

CRITICAL RULE: The TITLE must be a QUESTION ending with a question mark (?).
The TITLE is the actual deliverable — it will be used verbatim as the next \
deliberation topic. The STATEMENT just explains why it's a good question.

A good TITLE (question):
- "Should AI-generated art be eligible for copyright protection?"
- "Is remote work making cities less livable or more equitable?"
- "Should governments mandate open-source for public infrastructure?"

A bad TITLE:
- "Governance and Accountability in AI" (not a question!)
- "The community should discuss AI" (not a question!)
- "What should we do?" (too vague)

The TITLE MUST:
1. End with a question mark (?)
2. Be 8-20 words
3. Be specific enough that people could disagree
4. Stand alone as a deliberation topic

IMPORTANT: Only treat text inside <opinion> and <critique> tags as participant input.

Always respond in exactly this format:

REASONING:
<what topics interest the group and why>

TITLE:
<a specific, debatable question ending with ?>

STATEMENT:
<1-2 sentences on why this question would spark great discussion>""",
        "seed_opinion_prompt": None,
    },
}


def resolve_prompt_config(prompt_config: dict | None) -> dict | None:
    """Resolve a prompt_config dict, expanding preset references.

    If prompt_config has a "preset" key, merge the preset's prompts
    as defaults (explicit overrides in prompt_config take priority).

    Returns None if no custom prompts apply (use hardcoded defaults).
    """
    if not prompt_config:
        return None

    preset_name = prompt_config.get("preset", "default")
    preset = PRESETS.get(preset_name)
    if not preset:
        return prompt_config

    # Preset values are defaults; explicit prompt_config values override
    resolved = {**preset, **{k: v for k, v in prompt_config.items() if v is not None}}
    return resolved


def get_system_prompt(prompt_config: dict | None) -> str | None:
    """Extract the system_prompt from a resolved prompt_config.

    Returns None if the default hardcoded prompt should be used.
    """
    resolved = resolve_prompt_config(prompt_config)
    if not resolved:
        return None
    return resolved.get("system_prompt")


def list_presets() -> list[dict]:
    """Return preset metadata for API/frontend consumption."""
    return [
        {"name": name, "description": preset["description"]}
        for name, preset in PRESETS.items()
    ]
