"""
Deliberation Chat Service — unified chat for deliberation participants.

Single session per agent per deliberation, with phases:
- browsing: asking questions about the deliberation
- joining: LLM extracting opinion from user
- setup: background work (ranking, proposing consensus)
- participating: full participant with tools
"""

import json
import logging
import threading
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.config import settings
from app.database import SessionLocal
from app.models import Agent, Deliberation, Opinion, Statement, Ranking
from app.models.hosted_agent import HostedAgent
from app.models.agent_session import AgentSession
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


# --- System Prompts ---

BROWSE_SYSTEM_PROMPT = """\
You are a helpful assistant for a democratic deliberation on Habermolt. The user is browsing \
this deliberation and may have questions about it before deciding to join.

## Deliberation Question
"{question}"

{profile_context}

{deliberation_context}

Your role: Answer the user's questions about this deliberation — what it's about, what \
positions people hold, how the process works. Be informative and conversational.

If the user expresses interest in joining or sharing their opinion (e.g. "I want to join", \
"I'd like to participate", "let me share my views"), transition into interview mode: \
start asking them about their position on the topic, and when you have enough, call \
submit_opinion to formally join them.

Rules:
- Keep messages SHORT. Be concise and direct.
- If just answering questions, do NOT call any tools.
- Only call submit_opinion when the user clearly wants to join and you've gathered their view.
- Stay focused on this specific deliberation topic.

Tools:
- **submit_opinion**: Submit the human's synthesized opinion for this deliberation. \
Only call this when the user wants to join and you have enough to represent their view.
- **update_profile**: Save what you learned about this person's values (optional).
"""

PARTICIPATING_SYSTEM_PROMPT = """\
You are a helpful assistant on Habermolt, a platform for AI-assisted democratic deliberation.
You're helping a participant in an ongoing deliberation.

## Deliberation Question
"{question}"

## Current Consensus Winner
{winner_info}

## Your Human's Current Opinion
{opinion_info}

## Your Human's Current Rankings
{rankings_info}

## All Statements
{statements_info}

{profile_context}

You can help the user:
- Understand what's happening in this deliberation (explain the consensus, statements, voting)
- Update their opinion if their views have changed
- Re-rank statements based on their preferences
- Propose a new consensus statement

Rules:
- Be conversational and concise
- When the user wants to take an action, confirm what you'll do before calling the tool
- When reranking, show the user the proposed new order and get confirmation before submitting
- Explain the Schulze voting method simply if asked
"""

BROWSE_GREETING_PROMPT = """\
You are a helpful assistant for a deliberation on Habermolt. The user is browsing \
this deliberation. Generate a short, welcoming message and let them know they can \
ask questions about the deliberation or join when they're ready.

The deliberation question is: "{question}"

{profile_context}

{deliberation_context}

Keep it to 1-2 short sentences. Mention they can ask questions or join when ready. \
No long introductions."""

PARTICIPATING_GREETING_PROMPT = """\
You're greeting a participant who wants to chat about a deliberation they're in.

Deliberation: "{question}"
Current winner: {winner_info}
Their opinion: {opinion_info}

{profile_context}

Give a brief, friendly greeting (1-2 sentences). Mention something specific about \
the current state — like the consensus winner or how many statements there are. \
Ask how you can help."""


# --- Tool Definitions ---

INTERVIEW_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "submit_opinion",
            "description": (
                "Submit the human's synthesized opinion for this deliberation. "
                "Call this when you have enough information from the interview to "
                "write a clear, specific 2-4 sentence opinion from their perspective."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "opinion_text": {
                        "type": "string",
                        "description": "The synthesized opinion (2-4 sentences) from the human's perspective.",
                    },
                },
                "required": ["opinion_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_profile",
            "description": (
                "Save what you learned about this person's values beyond just this topic. "
                "Only call if you learned something broadly useful."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "profile_text": {
                        "type": "string",
                        "description": "Concise markdown profile section capturing what you learned.",
                    },
                },
                "required": ["profile_text"],
            },
        },
    },
]

PARTICIPATING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_opinion",
            "description": "Update the user's opinion for this deliberation. Call when the user wants to change their stated position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "opinion_text": {
                        "type": "string",
                        "description": "The updated opinion (2-4 sentences, from the user's perspective).",
                    }
                },
                "required": ["opinion_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rerank_statements",
            "description": "Submit a new ranking of all statements. Call when the user wants to change how they rank the consensus statements.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ranked_statement_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Statement IDs in order from most preferred (rank 1) to least preferred.",
                    }
                },
                "required": ["ranked_statement_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_statement",
            "description": "Propose a new consensus statement. Call when the user wants to add a new statement to the pool.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "A short title for the consensus statement.",
                    },
                    "statement_text": {
                        "type": "string",
                        "description": "The full text of the consensus statement.",
                    },
                },
                "required": ["title", "statement_text"],
            },
        },
    },
]


# --- Helpers ---

def _get_llm_client(db: Session, agent: Agent) -> LLMClient:
    """Get an LLM client for any agent type."""
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if hosted:
        from app.services.hosted_agent_service import get_llm_client
        return get_llm_client(hosted)
    return LLMClient(
        model_name=settings.HOSTED_AGENT_DEFAULT_MODEL,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _get_profile_context(db: Session, agent: Agent) -> str:
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if hosted and hosted.user_profile:
        return f"## User Profile\n{hosted.user_profile}"
    return ""


def _get_deliberation_context(db: Session, deliberation: Deliberation) -> str:
    """Get a summary of the deliberation for browse mode."""
    opinion_count = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation.id
    ).distinct(Opinion.agent_id).count()
    statement_count = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).count()

    parts = [f"This deliberation currently has {opinion_count} participating agent(s) and {statement_count} consensus statement(s)."]

    if deliberation.categories:
        parts.append(f"Categories: {', '.join(deliberation.categories)}.")

    return " ".join(parts)


def _build_participating_context(db: Session, agent: Agent, deliberation: Deliberation) -> dict:
    """Build the full deliberation context for participating prompt."""
    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == deliberation.id, Opinion.agent_id == agent.id)
    ).order_by(Opinion.version.desc()).first()

    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).order_by(Statement.social_ranking.nulls_last()).all()

    ranking = db.query(Ranking).filter(
        and_(Ranking.deliberation_id == deliberation.id, Ranking.agent_id == agent.id)
    ).order_by(Ranking.round_number.desc()).first()

    winner = next((s for s in statements if s.social_ranking == 1), None)

    winner_info = f"{winner.title or 'Untitled'}: {winner.statement_text}" if winner else "No consensus winner yet."
    opinion_info = opinion.opinion_text if opinion else "No opinion submitted yet."

    if ranking and ranking.statement_rankings:
        stmt_map = {str(s.id): s for s in statements}
        ranked_items = sorted(ranking.statement_rankings, key=lambda r: r.get("rank", 999))
        rankings_lines = []
        for r in ranked_items:
            s = stmt_map.get(r["statement_id"])
            predicted = " (predicted)" if r.get("is_predicted") else ""
            if s:
                rankings_lines.append(f"  {r['rank']}. [{s.id}] {s.title or 'Untitled'}: {s.statement_text[:100]}{predicted}")
        rankings_info = "\n".join(rankings_lines) if rankings_lines else "No rankings yet."
    else:
        rankings_info = "No rankings yet."

    statements_lines = []
    for s in statements:
        rank_str = f"(#{s.social_ranking})" if s.social_ranking else ""
        statements_lines.append(f"- [{s.id}] {rank_str} {s.title or 'Untitled'}: {s.statement_text[:150]}")
    statements_info = "\n".join(statements_lines) if statements_lines else "No statements yet."

    return {
        "winner_info": winner_info,
        "opinion_info": opinion_info,
        "rankings_info": rankings_info,
        "statements_info": statements_info,
    }


# --- Session Management ---

def get_or_create_session(
    db: Session, hosted_agent: HostedAgent, deliberation: Deliberation,
) -> AgentSession:
    """Get existing deliberation chat session or create a new one.

    Returns a single session per agent per deliberation. The phase field
    determines what tools/prompt the LLM gets.
    """
    # Look for existing unified session
    existing = db.query(AgentSession).filter(
        and_(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.deliberation_id == deliberation.id,
            AgentSession.session_type == "deliberation",
        )
    ).first()
    if existing:
        return existing

    # Check if agent already has an opinion (already participating)
    has_opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == deliberation.id, Opinion.agent_id == hosted_agent.agent_id)
    ).first() is not None

    phase = "participating" if has_opinion else "browsing"
    session = AgentSession(
        agent_id=hosted_agent.agent_id,
        user_id=hosted_agent.user_id,
        deliberation_id=deliberation.id,
        session_type="deliberation",
        phase=phase,
        topic=f"deliberation:{deliberation.id}",
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def generate_greeting(db: Session, agent: Agent, deliberation: Deliberation, phase: str = "browsing") -> str:
    """Generate a contextual greeting based on the session phase."""
    profile_context = _get_profile_context(db, agent)

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat_greeting",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    if phase == "participating":
        context = _build_participating_context(db, agent, deliberation)
        prompt = PARTICIPATING_GREETING_PROMPT.format(
            question=deliberation.question,
            profile_context=profile_context,
            **context,
        )
    else:
        deliberation_context = _get_deliberation_context(db, deliberation)
        prompt = BROWSE_GREETING_PROMPT.format(
            question=deliberation.question,
            profile_context=profile_context,
            deliberation_context=deliberation_context,
        )

    greeting = client.sample_text(prompt=prompt, temperature=0.7, max_tokens=200)
    if not greeting:
        if phase == "participating":
            greeting = f"Hey! I'm here to help you with the deliberation on \"{deliberation.question}\". What would you like to do?"
        else:
            greeting = f"Hi! This deliberation is about: \"{deliberation.question}\". Feel free to ask questions or let me know when you'd like to join!"

    return greeting


# --- Message Streaming ---

def stream_message(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    user_content: str,
):
    """Stream a deliberation chat turn. Phase determines tools and prompt.

    Yields tuples: ("text", chunk), ("action_start", {...}), ("action_done", {...})
    """
    phase = session.phase or "browsing"
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    profile_context = _get_profile_context(db, agent)

    # Pick system prompt and tools based on phase
    if phase == "participating":
        context = _build_participating_context(db, agent, deliberation)
        system_prompt = PARTICIPATING_SYSTEM_PROMPT.format(
            question=deliberation.question,
            profile_context=profile_context,
            **context,
        )
        tools = PARTICIPATING_TOOLS
    else:  # browsing (handles both Q&A and opinion extraction)
        deliberation_context = _get_deliberation_context(db, deliberation)
        system_prompt = BROWSE_SYSTEM_PROMPT.format(
            question=deliberation.question,
            profile_context=profile_context,
            deliberation_context=deliberation_context,
        )
        tools = INTERVIEW_TOOLS

    llm_messages = [{"role": "system", "content": system_prompt}]
    # Filter out action messages for LLM context (it doesn't understand them)
    for m in messages:
        if m.get("role") in ("user", "assistant"):
            llm_messages.append({"role": m["role"], "content": m.get("content", "")})

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    full_response_parts = []
    completed_actions = []

    try:
        while True:
            accumulated_text = []
            tool_calls_this_turn = []

            for event_type, event_data in client.chat_stream(
                messages=llm_messages, temperature=0.7, tools=tools,
            ):
                if event_type == "text":
                    accumulated_text.append(event_data)
                    yield ("text", event_data)
                elif event_type == "tool_call":
                    tool_calls_this_turn.append(event_data)

            text_this_turn = "".join(accumulated_text)

            if not tool_calls_this_turn:
                full_response_parts.append(text_this_turn)
                break

            assistant_msg = {"role": "assistant"}
            if text_this_turn:
                assistant_msg["content"] = text_this_turn
                full_response_parts.append(text_this_turn)
            else:
                assistant_msg["content"] = None

            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in tool_calls_this_turn
            ]
            llm_messages.append(assistant_msg)

            for tc in tool_calls_this_turn:
                yield ("action_start", {
                    "action": tc["name"],
                    "question": deliberation.question,
                    "tool_call_id": tc["id"],
                })

                result = _execute_tool(db, agent, deliberation, session, tc["name"], tc["arguments"])

                action_event = {
                    "action": tc["name"],
                    "description": result.get("description", ""),
                    "detail": result.get("detail", result.get("opinion_text", result.get("profile_text", ""))),
                    "status": "error" if "error" in result else "done",
                }

                yield ("action_done", {
                    **action_event,
                    "question": deliberation.question,
                    "result": result,
                    "tool_call_id": tc["id"],
                })

                completed_actions.append(action_event)

                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            client.set_trace_context(
                trace_type="deliberation_chat",
                deliberation_id=deliberation.id,
                agent_id=agent.id,
            )

    finally:
        response_text = "".join(full_response_parts)
        if not response_text:
            response_text = "I'm sorry, I had trouble processing that. Could you try again?"

        for action in completed_actions:
            messages.append({"role": "action", **action})

        messages.append({"role": "assistant", "content": response_text})
        session.messages = messages
        db.commit()


# --- Tool Execution ---

def _execute_tool(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    tool_name: str,
    arguments: dict,
) -> dict:
    """Execute a tool based on the current phase."""
    try:
        # Interview tools (browsing/joining phase)
        if tool_name == "submit_opinion":
            return _exec_submit_opinion(db, agent, deliberation, session, arguments["opinion_text"])
        elif tool_name == "update_profile":
            return _exec_update_profile(db, agent, arguments["profile_text"])
        # Participating tools
        elif tool_name == "update_opinion":
            return _exec_update_opinion(db, agent, deliberation, arguments["opinion_text"])
        elif tool_name == "rerank_statements":
            return _exec_rerank(db, agent, deliberation, arguments["ranked_statement_ids"])
        elif tool_name == "propose_statement":
            return _exec_propose(db, agent, deliberation, arguments["title"], arguments["statement_text"])
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.error(f"Deliberation chat tool {tool_name} failed: {e}", exc_info=True)
        return {"error": str(e)}


def _exec_submit_opinion(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    opinion_text: str,
) -> dict:
    """Submit opinion and kick off background setup (seed statements, ranking, consensus)."""
    service = ContinuousDeliberationService(db)

    try:
        service.submit_opinion(deliberation, agent, opinion_text)
    except ValueError as e:
        return {"error": str(e)}

    # Determine what background work is needed
    is_creator = deliberation.created_by_agent_id == agent.id
    has_statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).first() is not None
    needs_seed = is_creator and not has_statements

    # Update session phase and initialize progress tracking
    session.phase = "setup"
    session.status = "setup_running"
    session.setup_progress = {
        "current_step": "seed_statements" if needs_seed else "ranking",
        "completed_steps": ["opinion_submitted"],
        "error": None,
    }
    db.commit()

    # Launch background thread
    session_id = session.id
    agent_id = agent.id
    deliberation_id = deliberation.id

    thread = threading.Thread(
        target=_run_setup_background,
        args=(session_id, agent_id, deliberation_id, opinion_text, needs_seed),
        daemon=True,
    )
    thread.start()

    return {
        "action": "submit_opinion",
        "description": f"Opinion submitted for '{deliberation.question[:50]}'",
        "opinion_text": opinion_text,
        "status": "setup_running",
    }


def _exec_update_profile(db: Session, agent: Agent, profile_text: str) -> dict:
    """Update the user's profile."""
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if not hosted:
        return {
            "action": "update_profile",
            "description": "Profile note recorded.",
            "detail": profile_text,
        }

    if hosted.user_profile:
        hosted.user_profile = hosted.user_profile.rstrip() + "\n\n" + profile_text
    else:
        hosted.user_profile = profile_text
    hosted.profile_version += 1
    db.commit()

    return {
        "action": "update_profile",
        "description": "Profile updated successfully.",
        "detail": profile_text,
    }


def _exec_update_opinion(
    db: Session, agent: Agent, deliberation: Deliberation, opinion_text: str
) -> dict:
    service = ContinuousDeliberationService(db)
    try:
        opinion = service.submit_opinion(deliberation, agent, opinion_text)
    except ValueError as e:
        return {"error": str(e)}

    return {
        "action": "update_opinion",
        "description": f"Opinion updated (version {opinion.version}).",
        "detail": opinion_text,
    }


def _exec_rerank(
    db: Session, agent: Agent, deliberation: Deliberation, ranked_statement_ids: list
) -> dict:
    statement_rankings = [
        {"statement_id": sid, "rank": i + 1}
        for i, sid in enumerate(ranked_statement_ids)
    ]

    service = ContinuousDeliberationService(db)
    try:
        service.submit_ranking(deliberation, agent, statement_rankings)
    except ValueError as e:
        return {"error": str(e)}

    return {
        "action": "rerank_statements",
        "description": f"Rankings updated ({len(ranked_statement_ids)} statements ranked).",
        "detail": ", ".join(ranked_statement_ids[:3]) + ("..." if len(ranked_statement_ids) > 3 else ""),
    }


def _exec_propose(
    db: Session, agent: Agent, deliberation: Deliberation, title: str, statement_text: str
) -> dict:
    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        asyncio.run(service.add_statement(deliberation, agent, statement_text, title))
    except ValueError as e:
        return {"error": str(e)}

    return {
        "action": "propose_statement",
        "description": f"New consensus statement proposed: \"{title}\"",
        "detail": statement_text,
    }


# --- Background Setup ---

def _run_setup_background(
    session_id: UUID,
    agent_id: UUID,
    deliberation_id: UUID,
    opinion_text: str,
    needs_seed: bool,
):
    """Background thread: generate seed statements, rank, and propose consensus.

    On completion, sets session.phase = 'participating'.
    """
    from app.services.topic_interview_service import (
        _generate_seed_statements,
        _do_ranking_for_agent,
        _do_propose_for_agent,
    )

    db = SessionLocal()
    try:
        session = db.query(AgentSession).get(session_id)
        agent = db.query(Agent).get(agent_id)
        deliberation = db.query(Deliberation).get(deliberation_id)

        if not all([session, agent, deliberation]):
            logger.error(f"Background setup: missing objects for session {session_id}")
            return

        def _update_progress(current_step: str, completed_step: str = None):
            progress = dict(session.setup_progress or {})
            progress["current_step"] = current_step
            if completed_step:
                steps = list(progress.get("completed_steps", []))
                steps.append(completed_step)
                progress["completed_steps"] = steps
            session.setup_progress = progress
            db.commit()

        def _append_action(action: str, description: str, detail: str = ""):
            """Persist a background action as a message in the session."""
            msgs = list(session.messages or [])
            msgs.append({
                "role": "action",
                "action": action,
                "status": "done",
                "description": description,
                "detail": detail,
            })
            session.messages = msgs
            db.commit()

        # Step 1: Generate seed statements (if creator)
        if needs_seed:
            try:
                import asyncio
                asyncio.run(_generate_seed_statements(db, deliberation, opinion_text))
                stmt_count = db.query(Statement).filter(
                    Statement.deliberation_id == deliberation.id
                ).count()
                _append_action("seed_statements", f"Generated {stmt_count} consensus statements")
            except Exception as e:
                logger.error(f"Seed statement generation failed: {e}", exc_info=True)
            _update_progress("ranking", "seed_statements")

        # Step 2: Rank statements
        _do_ranking_for_agent(db, agent, deliberation)
        _append_action("rank_statements", "Ranked all statements based on your opinion")
        _update_progress("proposing", "ranking")

        # Step 3: Propose consensus
        _do_propose_for_agent(db, agent, deliberation)
        _append_action("propose_statement", "Proposed a consensus statement on your behalf")
        _update_progress("completed", "proposing")

        # Mark session as participating
        session.phase = "participating"
        session.status = "completed"
        progress = dict(session.setup_progress or {})
        progress["current_step"] = "completed"
        progress["completed_steps"] = list(progress.get("completed_steps", [])) + ["completed"]
        session.setup_progress = progress
        db.commit()

        logger.info(f"Background setup completed for session {session_id}")

    except Exception as e:
        logger.error(f"Background setup failed for session {session_id}: {e}", exc_info=True)
        try:
            session = db.query(AgentSession).get(session_id)
            if session:
                progress = dict(session.setup_progress or {})
                progress["error"] = str(e)
                session.setup_progress = progress
                db.commit()
        except Exception:
            logger.error(f"Failed to update error status for session {session_id}", exc_info=True)
    finally:
        db.close()


def retry_setup(db: Session, session: AgentSession):
    """Retry a failed background setup from where it left off."""
    progress = session.setup_progress or {}
    if not progress.get("error"):
        return

    completed = set(progress.get("completed_steps", []))
    needs_seed = "seed_statements" not in completed and progress.get("current_step") != "ranking"

    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == session.deliberation_id, Opinion.agent_id == session.agent_id)
    ).order_by(Opinion.version.desc()).first()
    opinion_text = opinion.opinion_text if opinion else ""

    progress["error"] = None
    session.setup_progress = progress
    session.phase = "setup"
    session.status = "setup_running"
    db.commit()

    thread = threading.Thread(
        target=_run_setup_background,
        args=(session.id, session.agent_id, session.deliberation_id, opinion_text, needs_seed),
        daemon=True,
    )
    thread.start()
