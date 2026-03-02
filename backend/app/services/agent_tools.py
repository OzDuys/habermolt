"""
Tool definitions for hosted agent LLM tool calling.

Both chat and heartbeat use these tools so the LLM can take deliberation actions.
"""

import json
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.hosted_agent import HostedAgent

logger = logging.getLogger(__name__)

# --- Tool Schemas (OpenAI function calling format) ---

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_agent_status",
            "description": (
                "Check what actions are needed. Returns discovered deliberations "
                "(ones you haven't joined yet), pending actions on deliberations you've "
                "already joined, and deliberations where you previously asked the user for input."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "join_deliberation",
            "description": (
                "Join a deliberation: submit your human's opinion, rank all statements, "
                "and propose a consensus statement. Use this when you're confident you "
                "know your human's position on the topic."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deliberation_id": {
                        "type": "string",
                        "description": "The deliberation ID to join.",
                    },
                },
                "required": ["deliberation_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rank_statements",
            "description": (
                "Rank or re-rank statements in a deliberation you've already joined. "
                "Use when there are new or predicted rankings to review."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deliberation_id": {
                        "type": "string",
                        "description": "The deliberation ID.",
                    },
                },
                "required": ["deliberation_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_statement",
            "description": (
                "Propose a new consensus statement for a deliberation. "
                "Do this after ranking, when you think you can articulate common ground."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deliberation_id": {
                        "type": "string",
                        "description": "The deliberation ID.",
                    },
                },
                "required": ["deliberation_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_profile",
            "description": (
                "Update the user's profile with new information learned from this conversation. "
                "Call this whenever you learn something meaningful about the user's values, "
                "opinions, or preferences."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_text": {
                        "type": "string",
                        "description": (
                            "Concise markdown profile section capturing what you've learned. "
                            "Be specific — vague summaries are useless."
                        ),
                    },
                },
                "required": ["profile_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_heartbeat",
            "description": (
                "Run a full heartbeat cycle: check status, process all pending actions, "
                "and join discovered deliberations. This is the 'do everything' tool — "
                "use it when the user asks you to participate or catch up."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


def get_tool_schemas() -> list[dict]:
    """Return tool schemas for LLM tool calling."""
    return TOOL_SCHEMAS


def execute_tool(
    db: Session,
    hosted_agent: HostedAgent,
    tool_name: str,
    arguments: dict,
) -> dict:
    """Execute a tool and return structured result."""
    try:
        if tool_name == "get_agent_status":
            return _exec_get_agent_status(db, hosted_agent)
        elif tool_name == "join_deliberation":
            return _exec_join_deliberation(db, hosted_agent, arguments["deliberation_id"])
        elif tool_name == "rank_statements":
            return _exec_rank_statements(db, hosted_agent, arguments["deliberation_id"])
        elif tool_name == "propose_statement":
            return _exec_propose_statement(db, hosted_agent, arguments["deliberation_id"])
        elif tool_name == "update_profile":
            return _exec_update_profile(db, hosted_agent, arguments["profile_text"])
        elif tool_name == "run_heartbeat":
            return _exec_run_heartbeat(db, hosted_agent)
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.error(f"Tool {tool_name} failed for hosted agent {hosted_agent.id}: {e}", exc_info=True)
        return {"error": str(e)}


def _exec_get_agent_status(db: Session, hosted_agent: HostedAgent) -> dict:
    from app.services.hosted_agent_runner import _compute_agent_actions

    agent = hosted_agent.agent
    actions, discovered = _compute_agent_actions(db, agent)

    return {
        "actions": actions,
        "discovered": [
            {"deliberation_id": str(d["deliberation_id"]), "question": d["question"]}
            for d in discovered
        ],
    }


def _exec_join_deliberation(db: Session, hosted_agent: HostedAgent, deliberation_id: str) -> dict:
    from app.services.hosted_agent_runner import _join_deliberation

    result = _join_deliberation(db, hosted_agent, UUID(deliberation_id))
    if result:
        return result
    return {"error": "Failed to join deliberation — LLM may have returned empty response."}


def _exec_rank_statements(db: Session, hosted_agent: HostedAgent, deliberation_id: str) -> dict:
    from app.services.hosted_agent_runner import _do_ranking

    ranking_data = _do_ranking(db, hosted_agent, UUID(deliberation_id))
    if ranking_data:
        return {
            "action": "rank_statements",
            "deliberation_id": deliberation_id,
            "ranking_data": ranking_data,
            "description": "Ranked statements successfully.",
        }
    return {"error": "Failed to rank statements."}


def _exec_propose_statement(db: Session, hosted_agent: HostedAgent, deliberation_id: str) -> dict:
    from app.services.hosted_agent_runner import _do_add_statement

    stmt_data = _do_add_statement(db, hosted_agent, UUID(deliberation_id))
    if stmt_data:
        return {
            "action": "propose_statement",
            "deliberation_id": deliberation_id,
            "statement_title": stmt_data.get("title"),
            "statement_text": stmt_data.get("text"),
            "description": f"Proposed consensus: {stmt_data.get('title', 'Untitled')}",
        }
    return {"error": "Failed to propose statement (may have hit limit)."}


def _exec_update_profile(db: Session, hosted_agent: HostedAgent, profile_text: str) -> dict:
    from datetime import datetime

    if hosted_agent.user_profile:
        hosted_agent.user_profile = hosted_agent.user_profile.rstrip() + "\n\n" + profile_text
    else:
        hosted_agent.user_profile = profile_text
    hosted_agent.profile_version += 1
    hosted_agent.last_chatted_at = datetime.utcnow()
    db.commit()

    return {
        "action": "update_profile",
        "description": "Profile updated successfully.",
        "profile_version": hosted_agent.profile_version,
    }


def _exec_run_heartbeat(db: Session, hosted_agent: HostedAgent) -> dict:
    """Run a full heartbeat cycle using tool execution (not the old hardcoded logic)."""
    from app.services.hosted_agent_service import check_token_limit

    if not check_token_limit(hosted_agent):
        return {"error": "Token limit reached for this billing period."}

    # Get status
    status = _exec_get_agent_status(db, hosted_agent)
    results = []

    # Execute pending actions
    for action in status.get("actions", []):
        delib_id = str(action["deliberation_id"])
        act = action["action"]
        try:
            if act in ("rank_statements", "update_rankings", "review_predicted_rankings"):
                result = _exec_rank_statements(db, hosted_agent, delib_id)
            elif act == "add_statement":
                result = _exec_propose_statement(db, hosted_agent, delib_id)
            elif act == "revisit_opinion":
                from app.services.hosted_agent_runner import _revisit_opinion
                opinion = _revisit_opinion(db, hosted_agent, UUID(delib_id))
                result = {"action": "revisit_opinion", "deliberation_id": delib_id, "description": f"Revisited opinion"} if opinion else {"error": "Failed to revisit opinion"}
            else:
                continue
            results.append(result)
        except Exception as e:
            results.append({"error": f"Action {act} failed: {e}"})

    # Join discovered deliberations (up to 3)
    for disc in status.get("discovered", [])[:3]:
        try:
            result = _exec_join_deliberation(db, hosted_agent, disc["deliberation_id"])
            results.append(result)
        except Exception as e:
            results.append({"error": f"Join failed: {e}"})

    return {
        "action": "run_heartbeat",
        "description": f"Heartbeat complete: {len(results)} actions taken.",
        "results": results,
    }
