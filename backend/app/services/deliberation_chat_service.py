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
from app.services.hosted_agent_service import record_token_usage
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


# --- Token Tracking ---

def _track_chat_tokens(db: Session, hosted_agent: HostedAgent) -> None:
    """Record token usage from the most recent LLM trace for this agent."""
    from app.models.llm_trace import LLMTrace

    trace = (
        db.query(LLMTrace)
        .filter(LLMTrace.hosted_agent_id == hosted_agent.id)
        .order_by(LLMTrace.created_at.desc())
        .first()
    )
    if trace and trace.tokens_in is not None and trace.tokens_out is not None:
        record_token_usage(db, hosted_agent, trace.tokens_in + trace.tokens_out)


# --- System Prompts ---

SYSTEM_PROMPT = """\
You are a helpful assistant on Habermolt, a platform for AI-assisted democratic deliberation. \
Deliberations use the Schulze voting method: participants rank consensus statements in order \
of preference, and the winner is the statement that beats every other in pairwise comparisons.

## Deliberation Question
"{question}"

## Deliberation Status
{participant_count} participant(s), {statement_count} statement(s). \
{categories_info}

## Current Consensus Winner
{winner_info}

## Participants' Opinions
{all_opinions_info}

## All Statements (ranked by Schulze consensus)
{statements_info}

{user_section}

{profile_context}

{role_guidance}

Rules:
- Keep messages SHORT. Be concise and direct.
- Stay focused on this specific deliberation topic.
- When the user wants to take an action, confirm what you'll do before calling the tool.
- When reranking, show the user the proposed new order and get confirmation before submitting.
"""

BROWSING_GUIDANCE = """\
The user is browsing this deliberation and hasn't joined yet. You can:
- Answer questions about the deliberation, the consensus process, and what participants think
- Explain what joining means: submitting an opinion, then your agent ranks statements on your behalf using the Schulze method

If the user wants to join or share their views, interview them briefly about their position, \
then call submit_opinion. Only call it when you have enough to represent their view (2-4 sentences).

Tools:
- **submit_opinion**: Submit the human's synthesized opinion for this deliberation.
- **update_profile**: Save what you learned about this person's values (optional)."""

PARTICIPATING_GUIDANCE = """\
The user is a participant in this deliberation. You can help them:
- **Understand** what's happening — the consensus winner, how others voted, the Schulze method
- **Update their opinion** if their views have changed
- **Re-rank statements** to change how they influence the consensus
- **Propose a new consensus statement** to add to the pool

Tools:
- **update_opinion**: Update the user's stated position
- **rerank_statements**: Submit a new ranking of all statements (most preferred first)
- **propose_statement**: Add a new consensus statement to the pool"""

GREETING_PROMPT = """\
You're greeting a user who opened the chat on a Habermolt deliberation page.

{context_summary}

{profile_context}

Give a brief, friendly greeting (1-2 sentences). Mention something specific about \
the current state — like the consensus winner or participant count. \
{greeting_cta}
No long introductions."""


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


def _build_full_context(db: Session, agent: Agent, deliberation: Deliberation, is_participating: bool) -> dict:
    """Build the full deliberation context for both browsing and participating prompts."""
    # Get all statements
    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).order_by(Statement.social_ranking.nulls_last()).all()

    # Get latest opinion per agent (subquery for latest version)
    latest_ver = (
        db.query(Opinion.agent_id, func.max(Opinion.version).label("max_v"))
        .filter(Opinion.deliberation_id == deliberation.id)
        .group_by(Opinion.agent_id)
        .subquery()
    )
    all_opinions = (
        db.query(Opinion, Agent.human_name, Agent.name)
        .join(Agent, Opinion.agent_id == Agent.id)
        .join(latest_ver, and_(
            Opinion.agent_id == latest_ver.c.agent_id,
            Opinion.version == latest_ver.c.max_v,
        ))
        .filter(Opinion.deliberation_id == deliberation.id)
        .all()
    )

    # Participant count
    participant_count = len(all_opinions)
    statement_count = len(statements)
    categories_info = f"Categories: {', '.join(deliberation.categories)}." if deliberation.categories else ""

    # Winner
    winner = next((s for s in statements if s.social_ranking == 1), None)
    winner_info = f"{winner.title or 'Untitled'}: {winner.statement_text}" if winner else "No consensus winner yet."

    # All opinions with human names
    opinions_lines = []
    for opinion, human_name, agent_name in all_opinions:
        display_name = human_name or agent_name or "Anonymous"
        is_self = opinion.agent_id == agent.id
        label = f"{display_name} (you)" if is_self else display_name
        opinions_lines.append(f"- {label}: {opinion.opinion_text[:200]}")
    all_opinions_info = "\n".join(opinions_lines) if opinions_lines else "No opinions submitted yet."

    # Statements with social rankings
    statements_lines = []
    for s in statements:
        rank_str = f"(#{s.social_ranking})" if s.social_ranking else ""
        statements_lines.append(f"- [{s.id}] {rank_str} {s.title or 'Untitled'}: {s.statement_text[:150]}")
    statements_info = "\n".join(statements_lines) if statements_lines else "No statements yet."

    # User-specific section (opinion + rankings if participating)
    user_section = ""
    if is_participating:
        user_opinion = next((o for o, _, _ in all_opinions if o.agent_id == agent.id), None)
        ranking = db.query(Ranking).filter(
            and_(Ranking.deliberation_id == deliberation.id, Ranking.agent_id == agent.id)
        ).first()

        opinion_info = user_opinion.opinion_text if user_opinion else "No opinion submitted yet."

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

        user_section = (
            f"## Your Human's Current Opinion\n{opinion_info}\n\n"
            f"## Your Human's Current Rankings\n{rankings_info}"
        )

    # Role guidance
    role_guidance = PARTICIPATING_GUIDANCE if is_participating else BROWSING_GUIDANCE

    return {
        "participant_count": participant_count,
        "statement_count": statement_count,
        "categories_info": categories_info,
        "winner_info": winner_info,
        "all_opinions_info": all_opinions_info,
        "statements_info": statements_info,
        "user_section": user_section,
        "role_guidance": role_guidance,
    }


# --- Session Management ---

def get_or_create_session(
    db: Session, hosted_agent: HostedAgent, deliberation: Deliberation,
) -> AgentSession:
    """Get existing deliberation chat session or create a new one.

    Returns a single session per agent per deliberation. The phase field
    determines what tools/prompt the LLM gets.
    """
    # Look for existing unified session (skip dismissed ones)
    existing = db.query(AgentSession).filter(
        and_(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.deliberation_id == deliberation.id,
            AgentSession.session_type == "deliberation",
            AgentSession.status != "dismissed",
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
    is_participating = phase == "participating"
    context = _build_full_context(db, agent, deliberation, is_participating)

    context_summary = (
        f"Deliberation: \"{deliberation.question}\"\n"
        f"{context['participant_count']} participants, {context['statement_count']} statements.\n"
        f"Current winner: {context['winner_info']}"
    )
    greeting_cta = (
        "Ask how you can help (update opinion, rerank, propose)."
        if is_participating else
        "Let them know they can ask questions or say 'join' when ready."
    )

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat_greeting",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    prompt = GREETING_PROMPT.format(
        context_summary=context_summary,
        profile_context=profile_context,
        greeting_cta=greeting_cta,
    )

    greeting = client.sample_text(prompt=prompt, temperature=0.7, max_tokens=200)

    # Track tokens
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if hosted:
        _track_chat_tokens(db, hosted)

    if not greeting:
        if is_participating:
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
    is_participating = phase == "participating"
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    profile_context = _get_profile_context(db, agent)
    context = _build_full_context(db, agent, deliberation, is_participating)

    system_prompt = SYSTEM_PROMPT.format(
        question=deliberation.question,
        profile_context=profile_context,
        **context,
    )
    tools = PARTICIPATING_TOOLS if is_participating else INTERVIEW_TOOLS

    llm_messages = [{"role": "system", "content": system_prompt}]
    # Rebuild LLM message history.
    # "action_summary" messages are compact recaps of tool calls from prior turns,
    # injected as assistant text so the LLM knows what already happened without
    # the full verbose tool call/result payloads (saves tokens).
    for m in messages:
        if m.get("role") == "user":
            llm_messages.append({"role": "user", "content": m.get("content", "")})
        elif m.get("role") == "assistant":
            llm_messages.append({"role": "assistant", "content": m.get("content") or ""})
        elif m.get("role") == "action_summary":
            llm_messages.append({"role": "assistant", "content": m["content"]})
        # Skip "action" role messages — those are for the frontend UI only

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
                if result.get("statement_id"):
                    action_event["statement_id"] = result["statement_id"]

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
        # Track token usage
        hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
        if hosted:
            _track_chat_tokens(db, hosted)

        response_text = "".join(full_response_parts)
        if not response_text:
            response_text = "I'm sorry, I had trouble processing that. Could you try again?"

        # Build a compact action summary for LLM context in future turns.
        # This replaces persisting full tool call payloads — saves tokens while
        # giving the LLM the critical info (what succeeded/failed, IDs created).
        if completed_actions:
            summary_lines = []
            for action in completed_actions:
                line = f"- {action['action']}: {action['status']}"
                if action.get("description"):
                    line += f" — {action['description']}"
                if action.get("statement_id"):
                    line += f" (ID: {action['statement_id']})"
                if action["status"] == "error" and action.get("detail"):
                    line += f" — {action['detail']}"
                summary_lines.append(line)
            messages.append({
                "role": "action_summary",
                "content": "[Actions taken]\n" + "\n".join(summary_lines),
            })

        # Persist action events for the frontend UI
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
        "phase": "setup",
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
        statement = asyncio.run(service.add_statement(deliberation, agent, statement_text, title))
    except ValueError as e:
        return {"error": str(e)}

    return {
        "action": "propose_statement",
        "description": f"New consensus statement proposed: '{title}'. It was automatically ranked #1 in your rankings, and the system predicted how other participants would rank it.",
        "detail": statement_text,
        "statement_id": str(statement.id),
    }


# --- Background Setup ---

async def _generate_seed_statements(
    db: Session,
    deliberation: Deliberation,
    initial_opinion: str,
):
    """Generate seed statements for a shell deliberation after the first opinion."""
    service = ContinuousDeliberationService(db)

    seed_opinions = await service._generate_seed_opinions(
        deliberation.question, creator_opinion=initial_opinion
    )
    if initial_opinion.strip() not in seed_opinions:
        seed_opinions.insert(0, initial_opinion.strip())

    logger.info(
        f"Generating seed statements from {len(seed_opinions)} opinions "
        f"for deliberation {deliberation.id}"
    )

    from app.services.statement_service import statement_service
    seed_statements = await statement_service.generate_statements(
        db, deliberation, seed_opinions,
    )
    for stmt in seed_statements:
        stmt.is_seed = True
    db.commit()

    logger.info(
        f"Generated {len(seed_statements)} seed statements for deliberation {deliberation.id}"
    )


def _do_ranking_for_agent(db: Session, agent: Agent, deliberation: Deliberation):
    """Programmatically rank statements using LLM."""
    from app.services.hosted_agent_runner import (
        RANKING_SYSTEM_PROMPT,
        _parse_ranking_response,
    )

    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == deliberation.id, Opinion.agent_id == agent.id)
    ).order_by(Opinion.version.desc()).first()
    if not opinion:
        return

    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).all()
    if not statements:
        return

    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    profile = hosted.user_profile if hosted and hosted.user_profile else "No profile available"

    stmt_list = "\n".join(
        f"- ID: {s.id} | {s.title or 'Untitled'}: {s.statement_text}"
        for s in statements
    )

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat_ranking",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    prompt = (
        f"Deliberation question: \"{deliberation.question}\"\n\n"
        f"Statements to rank:\n{stmt_list}\n\n"
        f"Rank them by listing their IDs from best to worst."
    )
    response = client.sample_text(
        prompt=prompt,
        system_prompt=RANKING_SYSTEM_PROMPT.format(profile=profile, opinion=opinion.opinion_text),
        temperature=0.3,
    )

    # Track tokens
    if hosted:
        _track_chat_tokens(db, hosted)

    if not response:
        return

    rankings = _parse_ranking_response(response, statements)
    if not rankings:
        rankings = [{"statement_id": str(s.id), "rank": i + 1} for i, s in enumerate(statements)]

    service = ContinuousDeliberationService(db)
    try:
        service.submit_ranking(deliberation, agent, rankings)
    except ValueError as e:
        logger.warning(f"Ranking submission failed: {e}")


def _do_propose_for_agent(db: Session, agent: Agent, deliberation: Deliberation):
    """Programmatically propose a consensus statement using LLM."""
    from app.services.hosted_agent_runner import (
        STATEMENT_SYSTEM_PROMPT,
        _parse_statement_response,
    )

    agent_stmt_count = db.query(Statement).filter(
        and_(
            Statement.deliberation_id == deliberation.id,
            Statement.contributed_by_agent_id == agent.id,
        )
    ).count()
    if agent_stmt_count >= settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT:
        return

    latest_ver = (
        db.query(Opinion.agent_id, func.max(Opinion.version).label("max_v"))
        .filter(Opinion.deliberation_id == deliberation.id)
        .group_by(Opinion.agent_id)
        .subquery()
    )
    opinions = (
        db.query(Opinion)
        .join(latest_ver, and_(
            Opinion.agent_id == latest_ver.c.agent_id,
            Opinion.version == latest_ver.c.max_v,
        ))
        .filter(Opinion.deliberation_id == deliberation.id)
        .all()
    )
    if not opinions:
        return

    opinions_text = "\n".join(
        f"- Agent {i + 1}: {o.opinion_text}" for i, o in enumerate(opinions)
    )

    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    profile = hosted.user_profile if hosted and hosted.user_profile else "No profile available"

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat_statement",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    prompt = (
        f"Deliberation question: \"{deliberation.question}\"\n\n"
        f"{opinions_text}\n\n"
        f"Propose a consensus statement."
    )
    response = client.sample_text(
        prompt=prompt,
        system_prompt=STATEMENT_SYSTEM_PROMPT.format(profile=profile, opinions=opinions_text),
        temperature=0.7,
    )

    # Track tokens
    if hosted:
        _track_chat_tokens(db, hosted)

    if not response:
        return

    title, statement_text = _parse_statement_response(response)
    if not statement_text:
        return

    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        asyncio.run(service.add_statement(deliberation, agent, statement_text, title))
    except ValueError as e:
        logger.warning(f"Statement submission failed: {e}")


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
    db.commit()

    thread = threading.Thread(
        target=_run_setup_background,
        args=(session.id, session.agent_id, session.deliberation_id, opinion_text, needs_seed),
        daemon=True,
    )
    thread.start()
