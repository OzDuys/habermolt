"""
Deliberation Chat Service — ongoing chat for deliberation participants.

Uses HostedAgentChatSession with deliberation_id set. Unlike the topic interview
(one-time, focused on extracting an opinion), this is an ongoing assistant
that helps participants update opinions, rerank statements, and propose consensus.
"""

import json
import logging

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.config import settings
from app.models import Agent, Deliberation, Opinion, Statement, Ranking
from app.models.hosted_agent import HostedAgent
from app.models.interview_session import HostedAgentChatSession
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


DELIBERATION_CHAT_SYSTEM_PROMPT = """\
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


DELIBERATION_CHAT_TOOLS = [
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


def _build_context(db: Session, agent: Agent, deliberation: Deliberation) -> dict:
    """Build the full deliberation context for the system prompt."""
    # Agent's latest opinion
    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == deliberation.id, Opinion.agent_id == agent.id)
    ).order_by(Opinion.version.desc()).first()

    # All statements
    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).order_by(Statement.social_ranking.nulls_last()).all()

    # Agent's current ranking
    ranking = db.query(Ranking).filter(
        and_(Ranking.deliberation_id == deliberation.id, Ranking.agent_id == agent.id)
    ).order_by(Ranking.round_number.desc()).first()

    # Winner
    winner = next((s for s in statements if s.social_ranking == 1), None)

    # Format
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


def get_or_create_session(
    db: Session, hosted_agent: HostedAgent, deliberation: Deliberation,
) -> HostedAgentChatSession:
    """Get existing deliberation chat session or create a new one."""
    existing = db.query(HostedAgentChatSession).filter(
        and_(
            HostedAgentChatSession.hosted_agent_id == hosted_agent.id,
            HostedAgentChatSession.deliberation_id == deliberation.id,
        )
    ).first()
    if existing:
        return existing

    session = HostedAgentChatSession(
        hosted_agent_id=hosted_agent.id,
        deliberation_id=deliberation.id,
        topic=f"deliberation:{deliberation.id}",
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def generate_greeting(db: Session, agent: Agent, deliberation: Deliberation) -> str:
    """Generate a contextual greeting for the deliberation chat."""
    context = _build_context(db, agent, deliberation)
    profile_context = _get_profile_context(db, agent)

    prompt = (
        f"You're greeting a participant who wants to chat about a deliberation they're in.\n\n"
        f"Deliberation: \"{deliberation.question}\"\n"
        f"Current winner: {context['winner_info']}\n"
        f"Their opinion: {context['opinion_info']}\n\n"
        f"{profile_context}\n\n"
        f"Give a brief, friendly greeting (1-2 sentences). Mention something specific about "
        f"the current state — like the consensus winner or how many statements there are. "
        f"Ask how you can help."
    )

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat_greeting",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    greeting = client.sample_text(prompt=prompt, temperature=0.7, max_tokens=200)
    if not greeting:
        greeting = f"Hey! I'm here to help you with the deliberation on \"{deliberation.question}\". What would you like to do?"

    return greeting


def stream_message(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    session: HostedAgentChatSession,
    user_content: str,
):
    """Stream a deliberation chat turn with tool calling support.

    Yields tuples: ("text", chunk), ("action_start", {...}), ("action_done", {...})
    """
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    context = _build_context(db, agent, deliberation)
    profile_context = _get_profile_context(db, agent)

    system_prompt = DELIBERATION_CHAT_SYSTEM_PROMPT.format(
        question=deliberation.question,
        profile_context=profile_context,
        **context,
    )

    llm_messages = [{"role": "system", "content": system_prompt}]
    llm_messages.extend(messages)

    client = _get_llm_client(db, agent)
    client.set_trace_context(
        trace_type="deliberation_chat",
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )

    full_response_parts = []

    try:
        while True:
            accumulated_text = []
            tool_calls_this_turn = []

            for event_type, event_data in client.chat_stream(
                messages=llm_messages, temperature=0.7, tools=DELIBERATION_CHAT_TOOLS,
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

                result = _execute_tool(db, agent, deliberation, tc["name"], tc["arguments"])

                yield ("action_done", {
                    "action": tc["name"],
                    "question": deliberation.question,
                    "result": result,
                    "description": result.get("description", ""),
                    "detail": result.get("detail", ""),
                    "tool_call_id": tc["id"],
                })

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

        messages.append({"role": "assistant", "content": response_text})
        session.messages = messages
        db.commit()


def _execute_tool(
    db: Session,
    agent: Agent,
    deliberation: Deliberation,
    tool_name: str,
    arguments: dict,
) -> dict:
    """Execute a deliberation chat tool."""
    try:
        if tool_name == "update_opinion":
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
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        loop.run_until_complete(service.add_statement(deliberation, agent, statement_text, title))
    except ValueError as e:
        return {"error": str(e)}

    return {
        "action": "propose_statement",
        "description": f"New consensus statement proposed: \"{title}\"",
        "detail": statement_text,
    }
