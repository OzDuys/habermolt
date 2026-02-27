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
from sqlalchemy import and_

from app.config import settings
from app.models import (
    Agent,
    Deliberation,
    DeliberationStage,
    Opinion,
    Ranking,
    Statement,
)
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


def run_single_hosted_agent(db: Session, hosted_agent: HostedAgent) -> dict:
    """Run one heartbeat cycle for a hosted agent."""
    if not check_token_limit(hosted_agent):
        notification_service.create_notification(
            db, hosted_agent.user_id,
            type="limit_approaching",
            title="Token limit reached",
            body=f"Your agent has used all available tokens for this billing period ({hosted_agent.pricing_tier} tier). Upgrade or wait for the next period.",
        )
        return {"status": "token_limit"}

    agent = hosted_agent.agent
    actions_taken = []

    # Compute actions + discovered (same logic as agent_status.py)
    actions, discovered = _compute_agent_actions(db, agent)

    # Handle actions first
    for action in actions:
        try:
            result = _execute_action(db, hosted_agent, action)
            if result:
                actions_taken.append(result)
        except Exception as e:
            logger.error(f"Action failed for hosted agent {hosted_agent.id}: {e}")

    # Join up to 3 discovered deliberations
    for disc in discovered[:3]:
        try:
            result = _join_deliberation(db, hosted_agent, disc["deliberation_id"])
            if result:
                actions_taken.append(result)
        except Exception as e:
            logger.error(f"Join failed for hosted agent {hosted_agent.id}: {e}")

    # Update heartbeat timestamp
    hosted_agent.last_heartbeat_at = datetime.utcnow()
    db.commit()

    # Create summary notification if actions were taken
    if actions_taken:
        summary = "; ".join(actions_taken[:5])
        notification_service.create_notification(
            db, hosted_agent.user_id,
            type="agent_action",
            title="Agent activity",
            body=f"Your agent participated in deliberations: {summary}",
        )

    return {"status": "ok", "actions_taken": actions_taken}


def _should_run_now(hosted_agent: HostedAgent) -> bool:
    if not hosted_agent.last_heartbeat_at:
        return True
    interval = FREQUENCY_INTERVALS.get(hosted_agent.participation_frequency, timedelta(hours=20))
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
            and_(Ranking.deliberation_id == delib.id, Ranking.agent_id == agent.id, Ranking.round_number == 0)
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

    return actions, discovered


def _execute_action(db: Session, hosted_agent: HostedAgent, action: dict) -> Optional[str]:
    """Execute a single action. Returns a description string or None."""
    delib_id = action["deliberation_id"]
    question = action["question"]
    act = action["action"]

    if act in ("rank_statements", "update_rankings", "review_predicted_rankings"):
        _do_ranking(db, hosted_agent, delib_id)
        return f"Ranked statements on '{question[:50]}'"

    elif act == "add_statement":
        _do_add_statement(db, hosted_agent, delib_id)
        return f"Proposed consensus on '{question[:50]}'"

    return None


def _join_deliberation(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> Optional[str]:
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
    opinion_text = client.sample_text(
        prompt=prompt,
        system_prompt=OPINION_SYSTEM_PROMPT.format(profile=profile),
        temperature=0.7,
    )

    if not opinion_text:
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

    return f"Joined '{delib.question[:50]}'"


def _do_ranking(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> None:
    """Rank all statements in a deliberation."""
    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    # Get agent's opinion
    opinion = db.query(Opinion).filter(
        and_(Opinion.deliberation_id == delib_id, Opinion.agent_id == agent.id)
    ).first()
    if not opinion:
        return

    # Get statements
    statements = db.query(Statement).filter(Statement.deliberation_id == delib_id).all()
    if not statements:
        return

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
        return

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

    _track_tokens_from_recent_trace(db, hosted_agent)


def _do_add_statement(db: Session, hosted_agent: HostedAgent, delib_id: UUID) -> None:
    """Propose a consensus statement."""
    agent = hosted_agent.agent
    profile = _get_profile_text(hosted_agent)

    # Check if we can add
    agent_stmt_count = db.query(Statement).filter(
        and_(Statement.deliberation_id == delib_id, Statement.contributed_by_agent_id == agent.id)
    ).count()
    if agent_stmt_count >= settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT:
        return

    # Get all opinions
    opinions = db.query(Opinion).filter(Opinion.deliberation_id == delib_id).all()
    if not opinions:
        return

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
        return

    # Parse title and statement
    title, statement_text = _parse_statement_response(response)
    if not statement_text:
        return

    import asyncio
    service = ContinuousDeliberationService(db)
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(service.add_statement(delib, agent, statement_text, title))
    except ValueError as e:
        logger.warning(f"Statement submission failed: {e}")

    _track_tokens_from_recent_trace(db, hosted_agent)


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
