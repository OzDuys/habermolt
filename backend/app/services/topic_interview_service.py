"""
Topic Interview Service — conducts a focused interview about a specific deliberation topic.

Works with ANY Agent type (hosted or OpenClaw). Unlike the general chat_service,
this is scoped to a single deliberation and has explicit completion states.

After the interview extracts an opinion, it programmatically:
1. Submits the opinion
2. Generates seed statements (if this agent is the creator)
3. Ranks statements
4. Proposes a consensus statement
"""

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.config import settings
from app.models import Agent, Deliberation, DeliberationStage, Opinion, Statement
from app.models.hosted_agent import HostedAgent
from app.models.agent_session import AgentSession
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


TOPIC_INTERVIEW_SYSTEM_PROMPT = """\
You are conducting a focused interview to understand a person's views on a specific topic \
for a democratic deliberation on Habermolt.

## Deliberation Question
"{question}"

{profile_context}

Your goal: have a brief, focused conversation (3-5 exchanges) to understand this person's \
position on the topic above, then submit their opinion.

Rules:
- Ask ONE question at a time
- Keep messages SHORT. 1-2 sentences max before your question. No preamble, no filler, no \
"Thanks for sharing" or "That's really interesting." Get to the point.
- Never open with a long warm-up paragraph. Jump straight into your question.
- Keep it conversational and natural
- Probe for specifics — don't accept vague answers
- When you have enough to write a clear, specific opinion (usually after 2-4 exchanges), \
call the submit_opinion tool with a synthesized 2-4 sentence opinion from their perspective
- Stay focused on this specific topic — don't wander to unrelated subjects
- Do not be formulaic. Vary your questions based on their responses.
- After submitting the opinion, tell the user what you submitted and that you'll now \
participate in the deliberation on their behalf.

Tools:
- **submit_opinion**: Submit the human's synthesized opinion for this deliberation. \
Call this when you have enough information to represent their view clearly.
- **update_profile**: Save what you learned about this person's values (optional, \
call if you learned something broadly useful beyond this specific topic).
"""

TOPIC_INTERVIEW_GREETING = """\
You are about to interview a person about their views on a deliberation topic. \
Generate a short greeting and your first question about the topic.

The deliberation question is: "{question}"

{profile_context}

Keep the greeting to ONE short sentence, then ask your first specific question. \
No long introductions or preamble. Don't ask a generic "what do you think?" question."""


# Tool schemas for topic interview (subset of full agent tools)
TOPIC_INTERVIEW_TOOLS = [
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


def _get_llm_client(db: Session, agent: Agent) -> LLMClient:
    """Get an LLM client for any agent type."""
    # If the agent has a hosted agent, use its configured model
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if hosted:
        from app.services.hosted_agent_service import get_llm_client
        return get_llm_client(hosted)

    # For OpenClaw agents, use the default platform model
    return LLMClient(
        model_name=settings.HOSTED_AGENT_DEFAULT_MODEL,
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )


def _get_profile_context(db: Session, agent: Agent) -> str:
    """Get profile context for the interview prompt."""
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if hosted and hosted.user_profile:
        return (
            f"## Existing Profile\n"
            f"You already know some things about this person:\n\n"
            f"{hosted.user_profile}\n\n"
            f"Use this as context but focus on their specific views on the deliberation topic."
        )
    return "You don't know anything about this person yet. Start from scratch."


def create_session(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    user_id: str,
) -> AgentSession:
    """Create a new topic interview session."""
    session = AgentSession(
        agent_id=agent.id,
        deliberation_id=deliberation.id,
        user_id=user_id,
        session_type="deliberation_join",
        messages=[],
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: str, user_id: str) -> Optional[AgentSession]:
    """Get a session by ID, scoped to a user."""
    return db.query(AgentSession).filter(
        AgentSession.id == session_id,
        AgentSession.user_id == user_id,
    ).first()


def generate_greeting(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
) -> str:
    """Generate the initial greeting message for the interview."""
    profile_context = _get_profile_context(db, agent)

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="topic_interview_greeting",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    prompt = TOPIC_INTERVIEW_GREETING.format(
        question=deliberation.question,
        profile_context=profile_context,
    )

    greeting = client.sample_text(
        prompt=prompt,
        temperature=0.7,
        max_tokens=300,
    )

    if not greeting:
        greeting = f"Hi! I'd like to understand your views on: \"{deliberation.question}\". What's your initial take on this?"

    # Store the greeting in the session
    messages = [{"role": "assistant", "content": greeting}]
    session.messages = messages
    db.commit()

    return greeting


def stream_message(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    user_content: str,
):
    """Stream a topic interview turn with tool calling support.

    Yields tuples:
    - ("text", chunk_str) for text content
    - ("action_start", {"action": name, ...}) before tool execution
    - ("action_done", {"action": name, ...}) after tool execution
    """
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    profile_context = _get_profile_context(db, agent)
    system_prompt = TOPIC_INTERVIEW_SYSTEM_PROMPT.format(
        question=deliberation.question,
        profile_context=profile_context,
    )

    llm_messages = [{"role": "system", "content": system_prompt}]
    llm_messages.extend(messages)

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="topic_interview_chat",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    full_response_parts = []

    try:
        while True:
            accumulated_text = []
            tool_calls_this_turn = []

            for event_type, event_data in client.chat_stream(
                messages=llm_messages, temperature=0.7, tools=TOPIC_INTERVIEW_TOOLS,
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

            # Build assistant message with tool calls
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

            # Execute each tool call
            for tc in tool_calls_this_turn:
                yield ("action_start", {
                    "action": tc["name"],
                    "question": deliberation.question,
                    "tool_call_id": tc["id"],
                })

                result = _execute_tool(db, agent, deliberation, session, tc["name"], tc["arguments"])

                yield ("action_done", {
                    "action": tc["name"],
                    "question": deliberation.question,
                    "result": result,
                    "description": result.get("description", ""),
                    "detail": result.get("opinion_text", result.get("profile_text", "")),
                    "tool_call_id": tc["id"],
                })

                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            # Reset trace context for next turn
            client.set_trace_context(
                trace_type="topic_interview_chat",
                deliberation_id=deliberation.id,
                agent_id=agent.id,
            )

    finally:
        # Persist conversation
        response_text = "".join(full_response_parts)
        if not response_text:
            response_text = "I'm sorry, I had trouble processing that. Could you try again?"

        messages.append({"role": "assistant", "content": response_text})
        session.messages = messages
        db.commit()


def _execute_tool(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    tool_name: str,
    arguments: dict,
) -> dict:
    """Execute a topic interview tool."""
    try:
        if tool_name == "submit_opinion":
            return _exec_submit_opinion(db, agent, deliberation, session, arguments["opinion_text"])
        elif tool_name == "update_profile":
            return _exec_update_profile(db, agent, arguments["profile_text"])
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.error(f"Topic interview tool {tool_name} failed: {e}", exc_info=True)
        return {"error": str(e)}


def _exec_submit_opinion(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: AgentSession,
    opinion_text: str,
) -> dict:
    """Submit opinion and trigger post-interview actions (seed statements, ranking, consensus)."""
    service = ContinuousDeliberationService(db)

    # Submit the opinion
    try:
        service.submit_opinion(deliberation, agent, opinion_text)
    except ValueError as e:
        return {"error": str(e)}

    # Update session status
    session.status = "opinion_submitted"
    db.commit()

    # If this agent is the creator and deliberation has no statements yet,
    # generate seed statements in the background
    is_creator = deliberation.created_by_agent_id == agent.id
    has_statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).first() is not None

    if is_creator and not has_statements:
        try:
            import asyncio
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            loop.run_until_complete(
                _generate_seed_statements(db, deliberation, opinion_text)
            )
        except Exception as e:
            logger.error(f"Seed statement generation failed: {e}", exc_info=True)

    # Now do ranking and propose consensus
    _do_ranking_for_agent(db, agent, deliberation)
    _do_propose_for_agent(db, agent, deliberation)

    session.status = "completed"
    db.commit()

    return {
        "action": "submit_opinion",
        "description": f"Opinion submitted for '{deliberation.question[:50]}'",
        "opinion_text": opinion_text,
        "status": "completed",
    }


def _exec_update_profile(db: Session, agent: Agent, profile_text: str) -> dict:
    """Update the user's profile (only works if they have a hosted agent)."""
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    if not hosted:
        # For OpenClaw agents, we can't update the profile (it's local to their machine)
        return {
            "action": "update_profile",
            "description": "Profile note recorded (OpenClaw agent — stored server-side).",
            "profile_text": profile_text,
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
        "profile_version": hosted.profile_version,
        "profile_text": profile_text,
    }


async def _generate_seed_statements(
    db: Session,
    deliberation: Deliberation,
    initial_opinion: str,
):
    """Generate seed statements for a shell deliberation after the first opinion."""
    service = ContinuousDeliberationService(db)

    # Generate synthetic diverse opinions
    seed_opinions = await service._generate_seed_opinions(
        deliberation.question, creator_opinion=initial_opinion
    )
    if initial_opinion.strip() not in seed_opinions:
        seed_opinions.insert(0, initial_opinion.strip())

    logger.info(
        f"Generating seed statements from {len(seed_opinions)} opinions "
        f"for deliberation {deliberation.id} (post-interview)"
    )

    from app.services.statement_service import statement_service
    seed_statements = await statement_service.generate_statements(
        db, deliberation, seed_opinions, round_number=0,
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

    # Get agent's latest opinion
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

    # Get profile text
    hosted = db.query(HostedAgent).filter(HostedAgent.agent_id == agent.id).first()
    profile = hosted.user_profile if hosted and hosted.user_profile else "No profile available"

    stmt_list = "\n".join(
        f"- ID: {s.id} | {s.title or 'Untitled'}: {s.statement_text}"
        for s in statements
    )

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="topic_interview_ranking",
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

    # Check statement limit
    agent_stmt_count = db.query(Statement).filter(
        and_(
            Statement.deliberation_id == deliberation.id,
            Statement.contributed_by_agent_id == agent.id,
        )
    ).count()
    if agent_stmt_count >= settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT:
        return

    # Get all opinions
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
        trace_type="topic_interview_statement",
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

    if not response:
        return

    title, statement_text = _parse_statement_response(response)
    if not statement_text:
        return

    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.run_until_complete(service.add_statement(deliberation, agent, statement_text, title))
    except ValueError as e:
        logger.warning(f"Statement submission failed: {e}")
