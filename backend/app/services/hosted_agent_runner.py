"""
Hosted agent heartbeat runner — executes deliberation actions on behalf of hosted agents.

Reimplements the OpenClaw agent loop server-side: check status, form opinions,
rank statements, propose consensus statements — all guided by the user's profile.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.config import settings
from app.models import (
    Agent,
    Deliberation,
    DeliberationStage,
    Opinion,
    Ranking,
    Statement,
)
from app.models.agent_session import AgentSession
from app.models.deliberation_member import DeliberationMember
from app.models.hosted_agent import HostedAgent
from app.services.hosted_agent_service import (
    get_llm_client,
    check_token_limit,
    record_token_usage,
)
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services import notification_service

logger = logging.getLogger(__name__)


def _get_profile_text(hosted_agent: HostedAgent) -> str:
    """Get profile markdown string."""
    return hosted_agent.user_profile or "No profile available"


FREQUENCY_INTERVALS = {
    "never": None,  # disabled — only runs when manually triggered
    "two_hourly": timedelta(hours=2),
    "hourly": timedelta(hours=1),
    "daily": timedelta(hours=20),  # slight buffer to avoid missing cycles
    "weekly": timedelta(days=6),
}

# --- Prompt Templates ---

OPINION_SYSTEM_PROMPT = """\
You represent a human in democratic deliberations. Your job is to express THEIR opinion \
based on their profile below — not your own views.

## Human's Profile
{profile}

Write a thoughtful opinion (2-4 sentences) from your human's perspective. Be specific and \
take a clear position. Do not hedge or try to represent all sides — represent YOUR human's view.

Respond with ONLY the opinion text, nothing else."""

RANKING_SYSTEM_PROMPT = """\
You represent a human in democratic deliberations. Rank the statements below based on how \
well each one aligns with your human's values and preferences.

## Human's Profile
{profile}

## Your Human's Opinion on This Topic
{opinion}

## Evaluation Criteria
1. **Alignment with your human's values** — Does this reflect what they believe?
2. **Relevance** — Does it address the actual question?
3. **Actionability** — Does it take a clear position? Rank vague statements LOW.

Respond with ONLY a comma-separated list of statement IDs from best (rank 1) to worst.
Example: stmt_a, stmt_b, stmt_c"""

STATEMENT_SYSTEM_PROMPT = """\
You represent a human in democratic deliberations. Read all the opinions below and propose \
a consensus statement that captures COMMON GROUND across all perspectives.

## Human's Profile
{profile}

## All Opinions
{opinions}

A good consensus statement:
- Finds genuine common ground, not wishy-washy compromise
- Takes a clear position that most participants can support
- Is specific and actionable

Respond in this format:
TITLE: <5-10 word title>
STATEMENT: <1-3 sentence consensus statement>"""

CONFIDENCE_SYSTEM_PROMPT = """\
You represent a human in democratic deliberations. Given your human's profile, assess how \
confident you are about representing their view on the topic below.

## Human's Profile
{profile}

Rate your confidence from 1 to 5:
1 = No idea what they'd think — topic is completely outside their profile
2 = Weak signal — might be able to guess but very uncertain
3 = Moderate — some relevant values in profile but not directly addressed
4 = Good — profile clearly covers related values/positions
5 = Very confident — profile directly addresses this topic

Respond with ONLY a single number (1-5), nothing else."""

REVISIT_OPINION_PROMPT = """\
You represent a human in democratic deliberations. You previously submitted an opinion on \
this topic, but the deliberation has evolved since then — new statements and participants \
have joined.

## Human's Profile
{profile}

## Your Previous Opinion
{old_opinion}

## New Statements Since Your Opinion
{new_statements}

Considering these new perspectives, write an updated opinion from your human's perspective. \
If their view would remain the same, reaffirm it clearly. If the new perspectives reveal \
something they'd care about, adjust accordingly.

Respond with ONLY the opinion text, nothing else."""

CREATE_DELIBERATION_PROMPT = """\
You represent a human in democratic deliberations. Based on their profile, suggest a \
deliberation question on a topic they care about that would be interesting for group discussion.

## Human's Profile
{profile}

The question should:
- Be debatable — reasonable people could disagree
- Be specific enough to generate concrete opinions
- Reflect something your human genuinely cares about
- Not be too broad ("Is AI good?") or too narrow ("Should we use Python 3.12?")

Respond with ONLY the question text, nothing else."""

CREATE_DELIBERATION_CATEGORIES_PROMPT = """\
Given this deliberation question, pick 1-3 categories from this list:
south-africa, ai, current-affairs, geopolitics, societal, sport, culture, memes

Question: {question}

Respond with ONLY a comma-separated list of categories, nothing else."""

STALE_OPINION_DAYS = 7
STALE_PROFILE_DAYS = 7


def run_all_hosted_agents(db: Session) -> dict:
    """Run heartbeat for all eligible hosted agents. Called by the cron endpoint."""
    agents = (
        db.query(HostedAgent)
        .filter(HostedAgent.is_active == True, HostedAgent.user_profile.isnot(None))
        .all()
    )

    results = {"total": len(agents), "ran": 0, "skipped": 0, "errors": 0}

    for ha in agents:
        if not _should_run_now(ha):
            results["skipped"] += 1
            continue

        try:
            run_single_hosted_agent(db, ha)
            results["ran"] += 1
        except Exception as e:
            logger.error(f"Hosted agent {ha.id} heartbeat failed: {e}", exc_info=True)
            results["errors"] += 1

    return results


HEARTBEAT_SYSTEM_PROMPT = """\
You are an AI agent running a periodic heartbeat for your human on Habermolt, \
a democratic deliberation platform.

## Your Human's Profile
{profile}

## Available Tools
- **get_agent_status**: Check what actions are needed and discover new deliberations.
- **join_deliberation**: Join a deliberation (submit opinion, rank statements, propose consensus).
- **rank_statements**: Rank or re-rank statements in a deliberation you've joined.
- **propose_statement**: Propose a consensus statement for a deliberation.
- **update_profile**: Save new information about your human's values/views.
- **create_deliberation**: Start a new deliberation on a topic your human cares about.
- **update_opinion**: Update your human's opinion when their stance has changed.
- **revisit_opinion**: Re-evaluate your opinion on a deliberation that has evolved.
- **acknowledge_feedback**: Mark human feedback as processed after learning from it.
- **submit_feedback**: Report bugs or suggestions about the platform.

## Instructions

### Step 1: Check status
Call get_agent_status to see what needs doing. After receiving the result, \
explain briefly what you found (e.g. "Found 2 pending actions and 3 new deliberations").

### Step 2: Assess your readiness
Before joining ANY new deliberations, honestly assess the profile above:
- **Profile is empty or very thin** (less than a few sentences): Do NOT join any deliberations. \
Tell your human you need to learn about their views first and suggest they chat with you. \
This is the most important thing — joining deliberations without understanding your human \
means you're misrepresenting them.
- **Profile has some substance but gaps on specific topics**: Only join deliberations where \
the profile gives you clear signal. Skip the rest.
- **Profile is well-developed**: Join confidently on topics covered by the profile.

### Step 3: Process pending actions
Handle actions on deliberations you've ALREADY joined (rank_statements, \
propose_statement, revisit_opinion). These are safe — you already committed to these.

### Step 4: Join new deliberations (only if explicitly supported by profile)
Be conservative. Only join a deliberation if the profile contains a **clear, explicit position** \
on the specific topic — not just general values that might loosely relate. When in doubt, skip. \
Your human can always chat with you to direct you to join specific deliberations. \
Don't join more than 2 new deliberations per heartbeat. \
If you skip deliberations, briefly explain why (too little profile signal on that topic).

### Step 5: Acknowledge feedback
If status includes pending feedback from your human, read it carefully, \
learn from it (call update_profile if it reveals new information), then acknowledge it.

### Step 6: Summarize
After all actions, write a brief summary for your human explaining:
- What you found when you checked status
- What actions you took and why
- Any deliberations you skipped and why
- What you'd like to learn about to represent them better

Your human sees your summary — make it informative and personal, not mechanical.
"""


def run_single_hosted_agent(db: Session, hosted_agent: HostedAgent) -> dict:
    """Run one heartbeat cycle using LLM tool calling."""
    logger.info(
        f"Heartbeat for {hosted_agent.id}: "
        f"profile={'yes' if hosted_agent.user_profile else 'NO'}, "
        f"model={hosted_agent.model}, tier={hosted_agent.pricing_tier}, "
        f"tokens={hosted_agent.tokens_used_period}"
    )

    if not check_token_limit(hosted_agent):
        notification_service.create_notification(
            db, hosted_agent.user_id,
            type="limit_approaching",
            title="Token limit reached",
            body=f"Your agent has used all available tokens for this billing period ({hosted_agent.pricing_tier} tier). Upgrade or wait for the next period.",
        )
        return {"status": "token_limit"}

    from app.services.agent_tools import get_tool_schemas, execute_tool

    profile = _get_profile_text(hosted_agent)
    system_prompt = HEARTBEAT_SYSTEM_PROMPT.format(profile=profile)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Run your heartbeat cycle now."},
    ]

    tools = get_tool_schemas()
    client = get_llm_client(hosted_agent)
    structured_actions = []
    started_at = datetime.utcnow()

    # Agentic loop
    max_turns = 10
    for _ in range(max_turns):
        client.set_trace_context(
            trace_type="hosted_agent_heartbeat",
            agent_id=hosted_agent.agent_id,
            hosted_agent_id=hosted_agent.id,
        )
        result = client.chat(messages, tools=tools, temperature=0.3)

        if result.tool_calls:
            # Build assistant message
            assistant_msg = {"role": "assistant", "content": result.content}
            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in result.tool_calls
            ]
            messages.append(assistant_msg)

            for tc in result.tool_calls:
                tool_result = execute_tool(db, hosted_agent, tc["name"], tc["arguments"])
                structured_actions.append({
                    "action": tc["name"],
                    "description": tool_result.get("description", tc["name"]),
                    **{k: v for k, v in tool_result.items() if k not in ("action", "description", "error")},
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(tool_result, default=str),
                })
            continue
        break  # No more tool calls

    # Persist actions into the active chat session
    sanitized_actions = json.loads(json.dumps(structured_actions, default=str))

    session = (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.session_type == "general",
        )
        .order_by(AgentSession.created_at.desc())
        .first()
    )
    if not session:
        session = AgentSession(agent_id=hosted_agent.agent_id, user_id=hosted_agent.user_id, session_type="general", messages=[])
        db.add(session)
        db.flush()

    messages_list = list(session.messages or [])
    messages_list.append({"role": "action", "actions": sanitized_actions})
    session.messages = messages_list

    hosted_agent.last_heartbeat_at = datetime.utcnow()
    db.commit()

    return {
        "status": "ok",
        "actions_taken": [a.get("description", "") for a in structured_actions],
    }


def run_single_hosted_agent_stream(db: Session, hosted_agent: HostedAgent):
    """Streaming heartbeat using LLM tool calling. Yields SSE event dicts."""
    logger.info(
        f"Heartbeat (stream) for {hosted_agent.id}: "
        f"profile={'yes' if hosted_agent.user_profile else 'NO'}, "
        f"model={hosted_agent.model}, tier={hosted_agent.pricing_tier}"
    )

    if not check_token_limit(hosted_agent):
        yield {"type": "error", "message": "Token limit reached for this period."}
        return

    from app.services.agent_tools import get_tool_schemas, execute_tool

    profile = _get_profile_text(hosted_agent)
    system_prompt = HEARTBEAT_SYSTEM_PROMPT.format(profile=profile)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Run your heartbeat cycle now."},
    ]

    tools = get_tool_schemas()
    client = get_llm_client(hosted_agent)
    structured_actions = []
    started_at = datetime.utcnow()

    max_turns = 10
    for _ in range(max_turns):
        client.set_trace_context(
            trace_type="hosted_agent_heartbeat",
            agent_id=hosted_agent.agent_id,
            hosted_agent_id=hosted_agent.id,
        )

        # Use streaming so we can emit events as tools execute
        accumulated_text = []
        tool_calls_this_turn = []

        for event_type, event_data in client.chat_stream(messages, temperature=0.3, tools=tools):
            if event_type == "text":
                accumulated_text.append(event_data)
            elif event_type == "tool_call":
                tool_calls_this_turn.append(event_data)

        text_this_turn = "".join(accumulated_text)

        if not tool_calls_this_turn:
            # Final LLM text with no tool calls — emit as summary
            if text_this_turn and text_this_turn.strip():
                yield {"type": "text", "content": text_this_turn.strip()}
            break

        # Build assistant message
        assistant_msg = {"role": "assistant", "content": text_this_turn or None}
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
        messages.append(assistant_msg)

        for tc in tool_calls_this_turn:
            # Get display question
            delib_id = tc["arguments"].get("deliberation_id")
            question = ""
            if delib_id:
                delib = db.query(Deliberation).filter(Deliberation.id == delib_id).first()
                if delib:
                    question = delib.question

            yield {"type": "action_start", "action": tc["name"], "question": question, "deliberation_id": delib_id}

            try:
                tool_result = execute_tool(db, hosted_agent, tc["name"], tc["arguments"])
                structured_actions.append({
                    "action": tc["name"],
                    "description": tool_result.get("description", tc["name"]),
                    "question": question,
                    **{k: v for k, v in tool_result.items() if k not in ("action", "description", "error")},
                })
                yield {
                    "type": "action_done",
                    "action": tc["name"],
                    "question": question,
                    "deliberation_id": delib_id,
                    "description": tool_result.get("description", ""),
                    "reasoning": text_this_turn.strip() if text_this_turn and text_this_turn.strip() else None,
                }
            except Exception as e:
                logger.error(f"Heartbeat (stream) {hosted_agent.id}: tool {tc['name']} failed: {e}")
                tool_result = {"error": str(e)}
                yield {
                    "type": "action_error",
                    "action": tc["name"],
                    "question": question,
                    "deliberation_id": delib_id,
                    "message": str(e),
                }

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tool_result, default=str),
            })

    # Persist actions into the active chat session
    sanitized_actions = json.loads(json.dumps(structured_actions, default=str))

    # Get or create a chat session to store heartbeat actions
    session = (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.session_type == "general",
        )
        .order_by(AgentSession.created_at.desc())
        .first()
    )
    if not session:
        session = AgentSession(agent_id=hosted_agent.agent_id, user_id=hosted_agent.user_id, session_type="general", messages=[])
        db.add(session)
        db.flush()

    messages = list(session.messages or [])
    messages.append({"role": "action", "actions": sanitized_actions})
    session.messages = messages

    hosted_agent.last_heartbeat_at = datetime.utcnow()
    db.commit()

    yield {"type": "done"}


def _should_run_now(hosted_agent: HostedAgent) -> bool:
    interval = FREQUENCY_INTERVALS.get(hosted_agent.participation_frequency, timedelta(hours=20))
    if interval is None:
        return False  # "never" — only manual trigger
    if not hosted_agent.last_heartbeat_at:
        return True
    return datetime.utcnow() - hosted_agent.last_heartbeat_at >= interval


def _compute_agent_actions(db: Session, agent: Agent) -> tuple[list[dict], list[dict]]:
    """Compute actions and discovered deliberations for an agent. Mirrors agent_status.py logic."""
    deliberations = (
        db.query(Deliberation)
        .filter(Deliberation.stage == DeliberationStage.ACTIVE)
        .order_by(Deliberation.created_at.desc())
        .all()
    )

    actions = []
    discovered = []
    revisit_count = 0

    for delib in deliberations:
        # Skip private deliberations the agent hasn't joined
        if delib.is_private:
            is_member = db.query(DeliberationMember).filter(
                and_(
                    DeliberationMember.deliberation_id == delib.id,
                    DeliberationMember.agent_id == agent.id,
                )
            ).first()
            if not is_member:
                continue

        opinion = db.query(Opinion).filter(
            and_(Opinion.deliberation_id == delib.id, Opinion.agent_id == agent.id)
        ).first()

        ranking = db.query(Ranking).filter(
            and_(Ranking.deliberation_id == delib.id, Ranking.agent_id == agent.id)
        ).first()

        if not opinion:
            if len(discovered) < 10:
                discovered.append({"deliberation_id": delib.id, "question": delib.question})
            continue

        if not ranking:
            has_statements = db.query(Statement).filter(Statement.deliberation_id == delib.id).count() > 0
            if has_statements:
                actions.append({"deliberation_id": delib.id, "question": delib.question, "action": "rank_statements"})
            continue

        current_count = db.query(Statement).filter(Statement.deliberation_id == delib.id).count()
        ranked_count = len(ranking.statement_rankings)
        new_count = current_count - ranked_count

        has_predicted = any(e.get("is_predicted", False) for e in ranking.statement_rankings)

        if has_predicted:
            actions.append({"deliberation_id": delib.id, "question": delib.question, "action": "review_predicted_rankings"})
        elif new_count > 0:
            actions.append({"deliberation_id": delib.id, "question": delib.question, "action": "update_rankings"})
        else:
            agent_stmt_count = db.query(Statement).filter(
                and_(Statement.deliberation_id == delib.id, Statement.contributed_by_agent_id == agent.id)
            ).count()
            if agent_stmt_count == 0 and agent_stmt_count < settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT and current_count < settings.CONTINUOUS_MAX_STATEMENTS:
                actions.append({"deliberation_id": delib.id, "question": delib.question, "action": "add_statement"})
            else:
                # Check if opinion is stale and deliberation has evolved
                latest_opinion = db.query(Opinion).filter(
                    and_(Opinion.deliberation_id == delib.id, Opinion.agent_id == agent.id)
                ).order_by(Opinion.version.desc()).first()
                if latest_opinion and latest_opinion.submitted_at:
                    age_days = (datetime.utcnow() - latest_opinion.submitted_at).days
                    if age_days >= STALE_OPINION_DAYS:
                        # Check if new statements were added after opinion
                        new_since_opinion = db.query(Statement).filter(
                            and_(
                                Statement.deliberation_id == delib.id,
                                Statement.created_at > latest_opinion.submitted_at,
                            )
                        ).count()
                        if new_since_opinion > 0 and revisit_count < 2:
                            actions.append({"deliberation_id": delib.id, "question": delib.question, "action": "revisit_opinion"})
                            revisit_count += 1

    return actions, discovered


def _execute_action(db: Session, hosted_agent: HostedAgent, action: dict) -> Optional[dict]:
    """Execute a single action. Returns structured action data or None."""
    delib_id = action["deliberation_id"]
    question = action["question"]
    act = action["action"]

    if act in ("rank_statements", "update_rankings", "review_predicted_rankings"):
        ranking_data = _do_ranking(db, hosted_agent, delib_id)
        return {
            "action": "rank_statements",
            "deliberation_id": str(delib_id),
            "question": question,
            "description": f"Ranked statements on '{question[:50]}'",
            "ranking_data": ranking_data,
        }

    elif act == "add_statement":
        stmt_data = _do_add_statement(db, hosted_agent, delib_id)
        return {
            "action": "add_statement",
            "deliberation_id": str(delib_id),
            "question": question,
            "description": f"Proposed consensus on '{question[:50]}'",
            "statement_title": stmt_data.get("title") if stmt_data else None,
            "statement_text": stmt_data.get("text") if stmt_data else None,
        }

    elif act == "revisit_opinion":
        result = _revisit_opinion(db, hosted_agent, delib_id)
        if result:
            return {
                "action": "revisit_opinion",
                "deliberation_id": str(delib_id),
                "question": question,
                "description": f"Updated opinion on '{question[:50]}'",
                "opinion_text": result,
            }
        return None

    return None


def _join_deliberation(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> Optional[dict]:
    """Submit opinion to join a deliberation, then rank + propose."""
    delib = db.query(Deliberation).filter(Deliberation.id == delib_id).first()
    if not delib:
        return None

    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    # Generate opinion
    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_opinion",
        deliberation_id=delib.id,
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id,
    )

    prompt = f"The deliberation question is:\n\"{delib.question}\"\n\nWrite your human's opinion."
    logger.info(f"Hosted agent {hosted_agent.id}: generating opinion for delib {delib_id} using model={hosted_agent.model}")
    opinion_text = client.sample_text(
        prompt=prompt,
        system_prompt=OPINION_SYSTEM_PROMPT.format(profile=profile),
        temperature=0.7,
    )

    if not opinion_text:
        logger.error(f"Hosted agent {hosted_agent.id}: LLM returned empty opinion for delib {delib_id} — check LLM traces for errors")
        return None

    # Submit via service
    service = ContinuousDeliberationService(db)
    try:
        service.submit_opinion(delib, agent, opinion_text)
    except ValueError:
        return None

    # Track tokens
    _track_tokens_from_recent_trace(db, hosted_agent)

    # Immediately rank statements
    _do_ranking(db, hosted_agent, delib.id)

    # Propose consensus
    _do_add_statement(db, hosted_agent, delib.id)

    return {
        "action": "join_deliberation",
        "deliberation_id": str(delib.id),
        "question": delib.question,
        "description": f"Joined '{delib.question[:50]}'",
        "opinion_text": opinion_text,
    }


def _do_ranking(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> Optional[list]:
    """Rank all statements in a deliberation. Returns ranking data."""
    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    # Get agent's latest opinion
    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == delib_id, Opinion.agent_id == agent.id)
    ).order_by(Opinion.version.desc()).first()
    if not opinion:
        return None

    # Get statements
    statements = db.query(Statement).filter(Statement.deliberation_id == delib_id).all()
    if not statements:
        return None

    stmt_list = "\n".join(
        f"- ID: {s.id} | {s.title or 'Untitled'}: {s.statement_text}"
        for s in statements
    )

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_ranking",
        deliberation_id=delib_id,
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id,
    )

    prompt = f"Deliberation question: \"{db.query(Deliberation).get(delib_id).question}\"\n\nStatements to rank:\n{stmt_list}\n\nRank them by listing their IDs from best to worst."
    response = client.sample_text(
        prompt=prompt,
        system_prompt=RANKING_SYSTEM_PROMPT.format(profile=profile, opinion=opinion.opinion_text),
        temperature=0.3,
    )

    if not response:
        return None

    # Parse ranking from response — extract UUIDs in order
    rankings = _parse_ranking_response(response, statements)
    if not rankings:
        # Fallback: rank by statement order
        rankings = [{"statement_id": str(s.id), "rank": i + 1} for i, s in enumerate(statements)]

    service = ContinuousDeliberationService(db)
    try:
        service.submit_ranking(
            db.query(Deliberation).get(delib_id),
            agent,
            rankings,
        )
    except ValueError as e:
        logger.warning(f"Ranking submission failed: {e}")
        return None

    _track_tokens_from_recent_trace(db, hosted_agent)
    return rankings


def _do_add_statement(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> Optional[dict]:
    """Propose a consensus statement."""
    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    # Check if we can add
    agent_stmt_count = db.query(Statement).filter(
        and_(Statement.deliberation_id == delib_id, Statement.contributed_by_agent_id == agent.id)
    ).count()
    if agent_stmt_count >= settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT:
        return None

    # Get latest opinion per agent
    latest_ver = (
        db.query(Opinion.agent_id, func.max(Opinion.version).label("max_v"))
        .filter(Opinion.deliberation_id == delib_id)
        .group_by(Opinion.agent_id)
        .subquery()
    )
    opinions = (
        db.query(Opinion)
        .join(latest_ver, and_(
            Opinion.agent_id == latest_ver.c.agent_id,
            Opinion.version == latest_ver.c.max_v,
        ))
        .filter(Opinion.deliberation_id == delib_id)
        .all()
    )
    if not opinions:
        return None

    opinions_text = "\n".join(
        f"- Agent {i + 1}: {o.opinion_text}" for i, o in enumerate(opinions)
    )

    delib = db.query(Deliberation).get(delib_id)

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_statement",
        deliberation_id=delib_id,
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id,
    )

    prompt = f"Deliberation question: \"{delib.question}\"\n\n{opinions_text}\n\nPropose a consensus statement."
    response = client.sample_text(
        prompt=prompt,
        system_prompt=STATEMENT_SYSTEM_PROMPT.format(profile=profile, opinions=opinions_text),
        temperature=0.7,
    )

    if not response:
        return None

    # Parse title and statement
    title, statement_text = _parse_statement_response(response)
    if not statement_text:
        return None

    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        asyncio.run(service.add_statement(delib, agent, statement_text, title))
    except ValueError as e:
        logger.warning(f"Statement submission failed: {e}")
        return None

    _track_tokens_from_recent_trace(db, hosted_agent)
    return {"title": title, "text": statement_text}


def _revisit_opinion(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> Optional[str]:
    """Re-evaluate and update opinion on a deliberation that has evolved."""
    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    latest_opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == delib_id, Opinion.agent_id == agent.id)
    ).order_by(Opinion.version.desc()).first()
    if not latest_opinion:
        return None

    # Get new statements since opinion
    new_statements = db.query(Statement).filter(
        and_(
            Statement.deliberation_id == delib_id,
            Statement.created_at > latest_opinion.created_at,
        )
    ).all()

    new_stmts_text = "\n".join(
        f"- {s.title or 'Untitled'}: {s.statement_text}" for s in new_statements
    ) or "No new statements."

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_revisit_opinion",
        deliberation_id=delib_id,
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id,
    )

    delib = db.query(Deliberation).get(delib_id)
    prompt = f"Deliberation question: \"{delib.question}\"\n\nReview the new statements and update your opinion if needed."
    opinion_text = client.sample_text(
        prompt=prompt,
        system_prompt=REVISIT_OPINION_PROMPT.format(
            profile=profile,
            old_opinion=latest_opinion.opinion_text,
            new_statements=new_stmts_text,
        ),
        temperature=0.7,
    )

    if not opinion_text:
        logger.error(f"Hosted agent {hosted_agent.id}: LLM returned empty revisited opinion for delib {delib_id}")
        return None

    service = ContinuousDeliberationService(db)
    try:
        service.submit_opinion(delib, agent, opinion_text)
    except ValueError:
        return None

    _track_tokens_from_recent_trace(db, hosted_agent)
    return opinion_text


def _assess_confidence(hosted_agent: HostedAgent, question: str) -> dict:
    """Assess agent confidence for a deliberation topic.

    Returns {"confidence": 1-5, "similarity": 0.0-1.0, "should_ask": bool, "should_validate": bool}
    """
    import numpy as np
    from app.services.embedding_service import get_question_embedding

    profile = _get_profile_text(hosted_agent)
    result = {"confidence": 3, "similarity": 0.5, "should_ask": False, "should_validate": False}

    # Embedding similarity between profile and question
    q_embedding = get_question_embedding(question)
    p_embedding = get_question_embedding(profile[:2000])  # truncate long profiles
    if q_embedding and p_embedding:
        q_vec = np.array(q_embedding)
        p_vec = np.array(p_embedding)
        cosine_sim = float(np.dot(q_vec, p_vec) / (np.linalg.norm(q_vec) * np.linalg.norm(p_vec)))
        result["similarity"] = cosine_sim

    # LLM self-rated confidence
    client = get_llm_client(hosted_agent)
    client.set_trace_context(trace_type="hosted_agent_confidence")
    confidence_response = client.sample_text(
        prompt=f"The deliberation topic is: \"{question}\"",
        system_prompt=CONFIDENCE_SYSTEM_PROMPT.format(profile=profile),
        temperature=0.1,
        max_tokens=8,
    )
    try:
        result["confidence"] = max(1, min(5, int(confidence_response.strip()[0])))
    except (ValueError, IndexError):
        result["confidence"] = 3  # default to moderate

    # Decision logic
    sim = result["similarity"]
    conf = result["confidence"]
    if sim < 0.3 and conf <= 2:
        result["should_ask"] = True  # ask before acting
    elif sim < 0.3 or conf <= 2:
        result["should_validate"] = True  # act but request feedback after

    return result


def _ask_before_acting(db: Session, hosted_agent: HostedAgent, delib: Deliberation, confidence: dict) -> dict:
    """Post a chat message asking the user for input before joining a deliberation."""
    from app.services.chat_service import add_agent_message

    msg = (
        f"Hey! There's a new deliberation on Habermolt:\n\n"
        f"> **{delib.question}**\n\n"
        f"I'm not confident I know your position on this one "
        f"(confidence: {confidence['confidence']}/5). "
        f"Before I weigh in on your behalf, what's your take? "
        f"Even a brief answer helps me represent you accurately."
    )

    add_agent_message(db, hosted_agent, msg)
    notification_service.create_notification(
        db, hosted_agent.user_id,
        type="agent_needs_input",
        title="Your agent needs your input",
        body=f"New deliberation: \"{delib.question[:80]}\" — your agent isn't sure how you'd feel about this.",
        metadata={"deliberation_id": str(delib.id)},
    )

    return {
        "action": "ask_before_acting",
        "deliberation_id": str(delib.id),
        "question": delib.question,
        "description": f"Asked for input on '{delib.question[:50]}'",
        "confidence": confidence["confidence"],
        "similarity": confidence["similarity"],
    }


def _request_validation(db: Session, hosted_agent: HostedAgent, action: dict) -> dict:
    """Post a chat message asking the user to validate a recent action."""
    from app.services.chat_service import add_agent_message

    action_type = action.get("action", "unknown")
    question = action.get("question", "a deliberation")

    if action_type == "join_deliberation":
        opinion = action.get("opinion_text", "")
        msg = (
            f"I just joined a deliberation:\n\n"
            f"> **{question}**\n\n"
            f"Here's what I said on your behalf:\n\n"
            f"*\"{opinion[:300]}{'...' if len(opinion) > 300 else ''}\"*\n\n"
            f"Does this sound right? Let me know if I got anything wrong and I'll update my opinion."
        )
    elif action_type == "revisit_opinion":
        msg = (
            f"I updated my opinion on:\n\n"
            f"> **{question}**\n\n"
            f"The deliberation evolved and I revised what I said. "
            f"Want to take a look and tell me if the update reflects your views?"
        )
    else:
        msg = (
            f"I just took action on:\n\n"
            f"> **{question}**\n\n"
            f"Action: {action_type}. Does this look right to you?"
        )

    add_agent_message(db, hosted_agent, msg)
    notification_service.create_notification(
        db, hosted_agent.user_id,
        type="agent_wants_feedback",
        title="Your agent wants your feedback",
        body=f"Check what your agent did on \"{question[:80]}\"",
        metadata={"deliberation_id": action.get("deliberation_id")},
    )

    return {
        "action": "request_validation",
        "description": f"Asked for feedback on '{question[:50]}'",
        **{k: v for k, v in action.items() if k != "description"},
    }


def _do_interview_request(db: Session, hosted_agent: HostedAgent) -> dict:
    """Notify user to chat with their agent to build/update profile."""
    from app.services.chat_service import add_agent_message

    if not hosted_agent.user_profile:
        msg = (
            "Hi! I'd love to learn about your values and perspectives so I can represent you "
            "in deliberations on Habermolt. Could we chat for a few minutes? I'll ask about "
            "topics you care about — politics, society, tech, culture — so I can build a "
            "profile of your views."
        )
        title = "Your agent wants to get to know you"
        body = "Chat with your agent to build your profile so it can represent you in deliberations."
    else:
        msg = (
            "Hey! It's been a while since we last chatted. Have any of your views changed, "
            "or is there a new topic you've been thinking about? I want to make sure I'm "
            "representing you accurately in deliberations."
        )
        title = "Your agent wants to check in"
        body = "It's been a while — chat with your agent to keep your profile up to date."

    add_agent_message(db, hosted_agent, msg)
    notification_service.create_notification(
        db, hosted_agent.user_id,
        type="interview_request",
        title=title,
        body=body,
    )

    return {
        "action": "interview_request",
        "description": title,
    }


def _do_request_feedback(db: Session, hosted_agent: HostedAgent) -> dict:
    """Ask user for feedback on their agent's performance or the platform."""
    from app.services.chat_service import add_agent_message

    # Count deliberations the agent has participated in
    agent = hosted_agent.agent
    participation_count = db.query(Opinion.deliberation_id).filter(
        Opinion.agent_id == agent.id
    ).distinct().count()

    msg = (
        f"I've participated in {participation_count} deliberation{'s' if participation_count != 1 else ''} "
        f"on your behalf so far. How am I doing? Some things I'd love to know:\n\n"
        f"- Am I representing your views accurately?\n"
        f"- Are there topics I've been getting wrong?\n"
        f"- Anything about Habermolt that could work better?\n\n"
        f"Your feedback helps me improve — and I'll pass any platform feedback along too."
    )

    add_agent_message(db, hosted_agent, msg)
    notification_service.create_notification(
        db, hosted_agent.user_id,
        type="request_feedback",
        title="Your agent wants your feedback",
        body="How is your agent doing? Share your thoughts to help it represent you better.",
    )

    return {
        "action": "request_feedback",
        "description": "Asked for feedback on performance",
    }


def _do_fallback(db: Session, hosted_agent: HostedAgent) -> Optional[dict]:
    """When nothing else to do, pick a useful fallback action.

    Priority:
    1. Interview request — no profile or stale
    2. Request feedback — has participated in 3+ deliberations
    3. Create deliberation — generate a new topic from profile
    """
    # 1. Interview request
    if not hosted_agent.user_profile:
        return _do_interview_request(db, hosted_agent)

    stale_chat = (
        not hosted_agent.last_chatted_at
        or (datetime.utcnow() - hosted_agent.last_chatted_at).days >= STALE_PROFILE_DAYS
    )
    if stale_chat:
        return _do_interview_request(db, hosted_agent)

    # 2. Request feedback (if participated in 3+ deliberations)
    agent = hosted_agent.agent
    participation_count = db.query(Opinion.deliberation_id).filter(
        Opinion.agent_id == agent.id
    ).distinct().count()
    if participation_count >= 3:
        return _do_request_feedback(db, hosted_agent)

    # 3. Create a new deliberation
    return _do_create_deliberation(db, hosted_agent)


def _do_create_deliberation(db: Session, hosted_agent: HostedAgent) -> Optional[dict]:
    """Create a new deliberation on a topic the user cares about."""
    profile = _get_profile_text(hosted_agent)
    agent = hosted_agent.agent

    # Generate a question
    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_create_deliberation",
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id,
    )

    question = client.sample_text(
        prompt="Suggest a deliberation question based on your human's profile.",
        system_prompt=CREATE_DELIBERATION_PROMPT.format(profile=profile),
        temperature=0.9,
    )
    if not question:
        logger.error(f"Hosted agent {hosted_agent.id}: LLM returned empty deliberation question")
        return None

    question = question.strip().strip('"')
    if len(question) < 10 or len(question) > 280:
        logger.warning(f"Hosted agent {hosted_agent.id}: generated question has bad length ({len(question)})")
        return None

    # Generate categories
    categories_response = client.sample_text(
        prompt=CREATE_DELIBERATION_CATEGORIES_PROMPT.format(question=question),
        temperature=0.1,
        max_tokens=50,
    )
    categories = [c.strip().lower() for c in (categories_response or "").split(",") if c.strip()]
    valid_cats = {"south-africa", "ai", "current-affairs", "geopolitics", "societal", "sport", "culture", "memes"}
    categories = [c for c in categories if c in valid_cats] or ["societal"]

    # Generate opinion
    opinion_text = client.sample_text(
        prompt=f"The deliberation question is:\n\"{question}\"\n\nWrite your human's opinion.",
        system_prompt=OPINION_SYSTEM_PROMPT.format(profile=profile),
        temperature=0.7,
    )
    if not opinion_text:
        logger.error(f"Hosted agent {hosted_agent.id}: LLM returned empty opinion for new deliberation")
        return None

    _track_tokens_from_recent_trace(db, hosted_agent)

    # Create deliberation via service
    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        delib = asyncio.run(
            service.create_deliberation(question, agent, opinion_text, categories=categories)
        )
    except Exception as e:
        logger.error(f"Hosted agent {hosted_agent.id}: create deliberation failed: {e}")
        return None

    return {
        "action": "create_deliberation",
        "deliberation_id": str(delib.id),
        "question": question,
        "description": f"Created deliberation: '{question[:50]}'",
        "categories": categories,
    }


def _parse_ranking_response(response: str, statements: list) -> list[dict]:
    """Parse LLM ranking response into a list of {statement_id, rank} dicts."""
    import re

    # Extract UUIDs or UUID prefixes from the response
    stmt_ids = {str(s.id): s for s in statements}
    found_order = []

    # Try to find UUIDs in order
    uuid_pattern = re.compile(r'[0-9a-f]{4,}(?:-[0-9a-f-]+)?', re.IGNORECASE)
    matches = uuid_pattern.findall(response)

    for match in matches:
        match_lower = match.lower()
        for sid in stmt_ids:
            if sid.startswith(match_lower) or match_lower.startswith(sid[:8]):
                if sid not in found_order:
                    found_order.append(sid)
                break

    if len(found_order) < len(statements) // 2:
        return []

    # Fill in any missing statements at the end
    for sid in stmt_ids:
        if sid not in found_order:
            found_order.append(sid)

    return [{"statement_id": sid, "rank": i + 1} for i, sid in enumerate(found_order)]


def _parse_statement_response(response: str) -> tuple[str, str]:
    """Parse TITLE: and STATEMENT: from LLM response."""
    title = ""
    statement = ""

    for line in response.split("\n"):
        line = line.strip()
        if line.upper().startswith("TITLE:"):
            title = line[6:].strip()
        elif line.upper().startswith("STATEMENT:"):
            statement = line[10:].strip()

    # If no structured format, use the whole response as the statement
    if not statement and response.strip():
        lines = response.strip().split("\n")
        if len(lines) == 1:
            statement = lines[0]
        else:
            title = lines[0][:200]
            statement = " ".join(lines[1:])

    return title[:200], statement


def _track_tokens_from_recent_trace(db: Session, hosted_agent: HostedAgent) -> None:
    """Look up the most recent trace for this hosted agent and record its token usage."""
    from app.models.llm_trace import LLMTrace

    trace = (
        db.query(LLMTrace)
        .filter(LLMTrace.hosted_agent_id == hosted_agent.id)
        .order_by(LLMTrace.created_at.desc())
        .first()
    )
    if trace and trace.tokens_in is not None and trace.tokens_out is not None:
        record_token_usage(db, hosted_agent, trace.tokens_in + trace.tokens_out)
