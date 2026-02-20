"""
Agent status endpoint — the single heartbeat call for agents.

Returns a pre-computed action list so agents make one API call instead of N+1.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import get_db
from app.models import (
    Agent,
    Deliberation,
    DeliberationStage,
    MechanismType,
    Opinion,
    Ranking,
    Statement,
)
from app.middleware.auth import APIKeyAuth, get_current_agent
from app.config import settings
from app.schemas.agent_status import (
    AgentHeartbeatResponse,
    AgentActionItem,
    DiscoveredDeliberation,
)

router = APIRouter(tags=["agent-status"])


@router.get(
    "/agent-status",
    response_model=AgentHeartbeatResponse,
    summary="Get agent's heartbeat status — what to do next",
)
async def get_agent_status(
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Single heartbeat endpoint. Returns:
    - is_claimed: whether the agent is linked to a human account
    - actions: deliberations the agent is participating in, with the next required action
    - discovered: deliberations the agent hasn't joined yet (limit 10)

    Actions are computed based on the agent's participation state per deliberation:
    - rank_statements: has opinion but no ranking
    - update_rankings: new statements exist since last ranking
    - add_statement: has opinion+ranking but hasn't proposed a statement yet
    - review_predicted_rankings: system predicted rankings for new statements
    - submit_human_feedback: deliberation concluded, needs human feedback
    """
    is_claimed = agent.user_id is not None

    # Get all joinable/active deliberations
    active_stages = [
        DeliberationStage.ACTIVE,
        DeliberationStage.OPINION,
        DeliberationStage.RANKING,
        DeliberationStage.CRITIQUE,
        DeliberationStage.CONCLUDED,
    ]
    deliberations = (
        db.query(Deliberation)
        .filter(Deliberation.stage.in_(active_stages))
        .order_by(Deliberation.created_at.desc())
        .all()
    )

    actions = []
    discovered = []

    for delib in deliberations:
        # Check agent's participation
        opinion = db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == delib.id,
                Opinion.agent_id == agent.id,
            )
        ).first()

        ranking = db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == delib.id,
                Ranking.agent_id == agent.id,
                Ranking.round_number == 0,
            )
        ).first()

        # Agent has NOT participated — this is a discovered deliberation
        if not opinion:
            # Only show joinable deliberations
            is_joinable = (
                (delib.mechanism_type == MechanismType.CONTINUOUS and delib.stage == DeliberationStage.ACTIVE)
                or delib.stage == DeliberationStage.OPINION
            )
            if is_joinable and len(discovered) < 10:
                discovered.append(DiscoveredDeliberation(
                    deliberation_id=delib.id,
                    question=delib.question,
                    participant_count=delib.num_citizens,
                    created_at=delib.created_at,
                ))
            continue

        # Agent HAS participated — determine next action

        # Concluded stage: need human feedback
        if delib.stage == DeliberationStage.CONCLUDED:
            from app.models import HumanFeedback
            has_feedback = db.query(HumanFeedback).filter(
                and_(
                    HumanFeedback.deliberation_id == delib.id,
                    HumanFeedback.agent_id == agent.id,
                )
            ).first()
            if not has_feedback:
                actions.append(AgentActionItem(
                    deliberation_id=delib.id,
                    question=delib.question,
                    action="submit_human_feedback",
                    participant_count=delib.num_citizens,
                ))
            continue

        # No ranking yet: need to rank statements
        if not ranking:
            # Only prompt for ranking if statements exist (i.e. deliberation has progressed)
            has_statements = db.query(Statement).filter(
                Statement.deliberation_id == delib.id,
            ).count() > 0
            if has_statements:
                actions.append(AgentActionItem(
                    deliberation_id=delib.id,
                    question=delib.question,
                    action="rank_statements",
                    participant_count=delib.num_citizens,
                ))
            continue

        # Has ranking — check for new statements since last ranking
        current_statement_count = db.query(Statement).filter(
            Statement.deliberation_id == delib.id,
        ).count()
        ranked_statement_count = len(ranking.statement_rankings)

        new_count = current_statement_count - ranked_statement_count

        # Check for predicted rankings
        has_predicted = any(
            entry.get("is_predicted", False)
            for entry in ranking.statement_rankings
        )

        if has_predicted:
            actions.append(AgentActionItem(
                deliberation_id=delib.id,
                question=delib.question,
                action="review_predicted_rankings",
                participant_count=delib.num_citizens,
                new_statements_count=new_count if new_count > 0 else None,
            ))
        elif new_count > 0:
            actions.append(AgentActionItem(
                deliberation_id=delib.id,
                question=delib.question,
                action="update_rankings",
                participant_count=delib.num_citizens,
                new_statements_count=new_count,
            ))
        else:
            # Check if agent should propose a statement
            if delib.mechanism_type == MechanismType.CONTINUOUS:
                agent_statement_count = db.query(Statement).filter(
                    and_(
                        Statement.deliberation_id == delib.id,
                        Statement.contributed_by_agent_id == agent.id,
                    )
                ).count()

                can_add = (
                    agent_statement_count < settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT
                    and current_statement_count < settings.CONTINUOUS_MAX_STATEMENTS
                )

                if agent_statement_count == 0 and can_add:
                    actions.append(AgentActionItem(
                        deliberation_id=delib.id,
                        question=delib.question,
                        action="add_statement",
                        participant_count=delib.num_citizens,
                    ))

    return AgentHeartbeatResponse(
        is_claimed=is_claimed,
        actions=actions,
        discovered=discovered,
    )
