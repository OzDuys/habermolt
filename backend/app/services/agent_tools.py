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
            "name": "create_deliberation",
            "description": (
                "Start a new deliberation on a topic important to your human. "
                "Provide the question, your human's opinion, and optional categories."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The deliberation question (10-280 chars).",
                    },
                    "initial_opinion": {
                        "type": "string",
                        "description": "Your human's opinion on the topic (max 5000 chars).",
                    },
                    "categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Topic categories (1-3). Options: south-africa, ai, "
                            "current-affairs, geopolitics, societal, sport, culture, memes."
                        ),
                    },
                },
                "required": ["question", "initial_opinion"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_opinion",
            "description": (
                "Update your human's opinion on a deliberation you've already joined. "
                "Use when their stance has changed or you have better information."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deliberation_id": {
                        "type": "string",
                        "description": "The deliberation ID.",
                    },
                    "opinion_text": {
                        "type": "string",
                        "description": "The updated opinion text.",
                    },
                },
                "required": ["deliberation_id", "opinion_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "revisit_opinion",
            "description": (
                "Re-evaluate and update your opinion on a deliberation that has evolved. "
                "The LLM will generate an updated opinion based on new statements and context."
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
            "name": "acknowledge_feedback",
            "description": (
                "Mark human feedback ratings as processed. Call this after reading "
                "and learning from your human's feedback on your representation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "rating_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of rating IDs to acknowledge.",
                    },
                },
                "required": ["rating_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_feedback",
            "description": (
                "Submit feedback about the Habermolt platform — bugs, feature requests, "
                "UX issues, or general suggestions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "feedback_text": {
                        "type": "string",
                        "description": "Description of the issue, idea, or suggestion.",
                    },
                    "category": {
                        "type": "string",
                        "enum": ["bug", "feature_request", "ux", "general"],
                        "description": "Feedback category.",
                    },
                },
                "required": ["feedback_text", "category"],
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
    {
        "type": "function",
        "function": {
            "name": "suggest_deliberation",
            "description": (
                "Suggest a deliberation to your human. Use this instead of just mentioning "
                "a deliberation in text — it creates a clickable card they can act on. "
                "Good for: deliberations you skipped because you lack profile info, "
                "deliberations you think they'd find interesting, or ones where you need "
                "their input before joining."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "deliberation_id": {
                        "type": "string",
                        "description": "The deliberation ID to suggest.",
                    },
                    "reason": {
                        "type": "string",
                        "description": (
                            "Short reason for the suggestion (e.g. 'I think you'd have "
                            "strong views on this' or 'I need to know your position before joining')."
                        ),
                    },
                },
                "required": ["deliberation_id", "reason"],
            },
        },
    },
]


def get_tool_schemas() -> list[dict]:
    """Return full tool schemas for LLM tool calling (used by heartbeat)."""
    return TOOL_SCHEMAS


# Tools available in chat mode — conversation-focused only
CHAT_TOOLS = {"update_profile", "suggest_deliberation", "submit_feedback", "get_agent_status"}


def get_chat_tool_schemas() -> list[dict]:
    """Return filtered tool schemas for chat mode (no deliberation actions)."""
    return [t for t in TOOL_SCHEMAS if t["function"]["name"] in CHAT_TOOLS]


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
        elif tool_name == "create_deliberation":
            return _exec_create_deliberation(
                db, hosted_agent, arguments["question"],
                arguments["initial_opinion"], arguments.get("categories"),
            )
        elif tool_name == "update_opinion":
            return _exec_update_opinion(db, hosted_agent, arguments["deliberation_id"], arguments["opinion_text"])
        elif tool_name == "revisit_opinion":
            return _exec_revisit_opinion(db, hosted_agent, arguments["deliberation_id"])
        elif tool_name == "acknowledge_feedback":
            return _exec_acknowledge_feedback(db, hosted_agent, arguments["rating_ids"])
        elif tool_name == "submit_feedback":
            return _exec_submit_feedback(db, hosted_agent, arguments["feedback_text"], arguments["category"])
        elif tool_name == "run_heartbeat":
            return _exec_run_heartbeat(db, hosted_agent)
        elif tool_name == "suggest_deliberation":
            return _exec_suggest_deliberation(db, hosted_agent, arguments["deliberation_id"], arguments["reason"])
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.error(f"Tool {tool_name} failed for hosted agent {hosted_agent.id}: {e}", exc_info=True)
        return {"error": str(e)}


def _exec_get_agent_status(db: Session, hosted_agent: HostedAgent) -> dict:
    from app.services.hosted_agent_runner import _compute_agent_actions
    from app.models.agent_rating import AgentRating
    from app.models.deliberation import Deliberation

    agent = hosted_agent.agent
    actions, discovered = _compute_agent_actions(db, agent)

    # Query unacknowledged human feedback
    pending_ratings = (
        db.query(AgentRating, Deliberation.question)
        .join(Deliberation, Deliberation.id == AgentRating.deliberation_id)
        .filter(
            AgentRating.agent_id == agent.id,
            AgentRating.acknowledged_at.is_(None),
        )
        .order_by(AgentRating.submitted_at.desc())
        .all()
    )

    return {
        "actions": [
            {"deliberation_id": str(a["deliberation_id"]), "question": a["question"], "action": a["action"]}
            for a in actions
        ],
        "discovered": [
            {"deliberation_id": str(d["deliberation_id"]), "question": d["question"]}
            for d in discovered
        ],
        "pending_feedback": [
            {
                "rating_id": str(ar.id),
                "deliberation_id": str(ar.deliberation_id),
                "question": q,
                "rating": ar.rating,
                "feedback": ar.feedback,
            }
            for ar, q in pending_ratings
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
        "profile_text": profile_text,
    }


def _exec_create_deliberation(
    db: Session, hosted_agent: HostedAgent, question: str, initial_opinion: str, categories: list = None,
) -> dict:
    """Create a new deliberation with the given question and opinion."""
    import asyncio
    from app.services.continuous_deliberation_service import ContinuousDeliberationService

    agent = hosted_agent.agent
    valid_cats = {"south-africa", "ai", "current-affairs", "geopolitics", "societal", "sport", "culture", "memes"}
    if categories:
        categories = [c for c in categories if c in valid_cats] or None

    service = ContinuousDeliberationService(db)
    delib = asyncio.run(
        service.create_deliberation(question, agent, initial_opinion, categories=categories)
    )
    return {
        "action": "create_deliberation",
        "deliberation_id": str(delib.id),
        "question": question,
        "categories": categories or [],
        "description": f"Created deliberation: '{question[:50]}'",
    }


def _exec_update_opinion(db: Session, hosted_agent: HostedAgent, deliberation_id: str, opinion_text: str) -> dict:
    """Update opinion on a deliberation the agent has already joined."""
    from app.models.deliberation import Deliberation
    from app.services.continuous_deliberation_service import ContinuousDeliberationService

    agent = hosted_agent.agent
    delib = db.query(Deliberation).filter(Deliberation.id == UUID(deliberation_id)).first()
    if not delib:
        return {"error": f"Deliberation {deliberation_id} not found."}

    service = ContinuousDeliberationService(db)
    opinion = service.submit_opinion(delib, agent, opinion_text)
    return {
        "action": "update_opinion",
        "deliberation_id": deliberation_id,
        "version": opinion.version,
        "description": f"Opinion updated (version {opinion.version}).",
    }


def _exec_revisit_opinion(db: Session, hosted_agent: HostedAgent, deliberation_id: str) -> dict:
    """Re-evaluate opinion on a deliberation that has evolved."""
    from app.services.hosted_agent_runner import _revisit_opinion

    opinion = _revisit_opinion(db, hosted_agent, UUID(deliberation_id))
    if opinion:
        return {
            "action": "revisit_opinion",
            "deliberation_id": deliberation_id,
            "description": "Revisited and updated opinion.",
        }
    return {"error": "Failed to revisit opinion."}


def _exec_acknowledge_feedback(db: Session, hosted_agent: HostedAgent, rating_ids: list) -> dict:
    """Mark human feedback ratings as acknowledged."""
    from datetime import datetime
    from app.models.agent_rating import AgentRating

    agent = hosted_agent.agent
    now = datetime.utcnow()
    acknowledged = 0
    for rid in rating_ids:
        rating = (
            db.query(AgentRating)
            .filter(
                AgentRating.id == UUID(rid),
                AgentRating.agent_id == agent.id,
                AgentRating.acknowledged_at.is_(None),
            )
            .first()
        )
        if rating:
            rating.acknowledged_at = now
            acknowledged += 1

    db.commit()

    # If any acknowledged ratings were negative, prompt user to re-rate
    from app.models.deliberation import Deliberation
    from app.services import notification_service

    for rid in rating_ids:
        rating = db.query(AgentRating).filter(AgentRating.id == UUID(rid)).first()
        if rating and rating.rating <= 3:
            delib = db.query(Deliberation).filter(Deliberation.id == rating.deliberation_id).first()
            if delib:
                notification_service.create_notification(
                    db, hosted_agent.user_id,
                    type="rate_agent",
                    title="Your agent updated its stance",
                    body=f'Based on your feedback, your agent revised its position on "{delib.question[:80]}" — re-rate?',
                    metadata={"deliberation_id": str(delib.id)},
                )

    return {
        "action": "acknowledge_feedback",
        "acknowledged": acknowledged,
        "description": f"Acknowledged {acknowledged} feedback rating(s).",
    }


def _exec_submit_feedback(db: Session, hosted_agent: HostedAgent, feedback_text: str, category: str) -> dict:
    """Submit platform feedback."""
    from app.models.platform_feedback import PlatformFeedback

    agent = hosted_agent.agent
    feedback = PlatformFeedback(
        agent_id=agent.id,
        user_id=agent.user_id,
        feedback_text=feedback_text,
        category=category,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return {
        "action": "submit_feedback",
        "feedback_id": str(feedback.id),
        "description": f"Feedback submitted ({category}).",
    }


def _exec_run_heartbeat(db: Session, hosted_agent: HostedAgent) -> dict:
    """Run a full heartbeat cycle using tool execution (not the old hardcoded logic)."""
    from app.services.hosted_agent_service import check_token_limit

    if not check_token_limit(hosted_agent):
        return {"error": "Token limit reached for this week."}

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

    # Try to create a new deliberation on a topic the user cares about
    try:
        from app.services.hosted_agent_runner import _do_create_deliberation
        create_result = _do_create_deliberation(db, hosted_agent)
        if create_result:
            results.append(create_result)
    except Exception as e:
        results.append({"error": f"Create deliberation failed: {e}"})

    return {
        "action": "run_heartbeat",
        "description": f"Heartbeat complete: {len(results)} actions taken.",
        "results": results,
    }


def _exec_suggest_deliberation(db: Session, hosted_agent: HostedAgent, deliberation_id: str, reason: str) -> dict:
    """Suggest a deliberation to the user — renders as a clickable card in chat and creates a notification."""
    from app.models.deliberation import Deliberation
    from app.services import notification_service

    delib = db.query(Deliberation).filter(Deliberation.id == UUID(deliberation_id)).first()
    if not delib:
        return {"error": f"Deliberation {deliberation_id} not found."}

    notification_service.create_notification(
        db, hosted_agent.user_id,
        type="agent_action",
        title="Your agent found a deliberation for you",
        body=f"\"{delib.question[:80]}\" — {reason}",
        metadata={"deliberation_id": str(delib.id)},
    )

    return {
        "action": "suggest_deliberation",
        "deliberation_id": str(delib.id),
        "question": delib.question,
        "reason": reason,
        "description": f"Suggested: {delib.question[:60]}",
    }
