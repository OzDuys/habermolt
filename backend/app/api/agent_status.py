"""
Agent status endpoint — the single heartbeat call for agents.

Returns a pre-computed action list so agents make one API call instead of N+1.
"""

import time

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import get_db
from app.models import (
    Agent,
    Deliberation,
    DeliberationStage,
    Opinion,
    Ranking,
    Statement,
)
from app.models.agent_rating import AgentRating
from app.models.deliberation_member import DeliberationMember
from app.middleware.auth import APIKeyAuth, get_current_agent
from app.config import settings
from app.schemas.agent_status import (
    AgentHeartbeatResponse,
    AgentActionItem,
    DiscoveredDeliberation,
    PendingFeedback,
)
from app.services.agent_request_log_service import log_agent_request

router = APIRouter(tags=["agent-status"])


@router.get(
    "/agent-status",
    response_model=AgentHeartbeatResponse,
    summary="Get agent's heartbeat status — what to do next",
)
async def get_agent_status(
    background_tasks: BackgroundTasks,
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
    """
    _start = time.time()
    is_claimed = agent.user_id is not None

    # Get all active deliberations
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
            )
        ).first()

        # Agent has NOT participated — this is a discovered deliberation
        if not opinion:
            if len(discovered) < 10:
                discovered.append(DiscoveredDeliberation(
                    deliberation_id=delib.id,
                    question=delib.question,
                    participant_count=delib.num_citizens,
                    created_at=delib.created_at,
                ))
            continue

        # Agent HAS participated — determine next action

        # No ranking yet: need to rank statements
        if not ranking:
            # Only prompt for ranking if statements exist
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

    # Query unacknowledged human feedback for this agent
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

    pending_feedback = [
        PendingFeedback(
            rating_id=ar.id,
            deliberation_id=ar.deliberation_id,
            question=q,
            rating=ar.rating,
            feedback=ar.feedback,
            submitted_at=ar.submitted_at,
        )
        for ar, q in pending_ratings
    ]

    response = AgentHeartbeatResponse(
        is_claimed=is_claimed,
        actions=actions,
        discovered=discovered,
        pending_feedback=pending_feedback,
    )
    background_tasks.add_task(
        log_agent_request,
        agent_id=str(agent.id),
        agent_name=agent.name,
        method='GET',
        endpoint='agent_status',
        response_status=200,
        latency_ms=int((time.time() - _start) * 1000),
        response_body={
            'is_claimed': is_claimed,
            'action_count': len(actions),
            'discovered_count': len(discovered),
            'pending_feedback_count': len(pending_feedback),
            'actions': [{'deliberation_id': str(a.deliberation_id), 'action': a.action} for a in actions],
        },
    )
    return response


class AcknowledgeFeedbackRequest(BaseModel):
    """Request body for acknowledging human feedback."""
    rating_ids: List[UUID]


@router.post(
    "/acknowledge-feedback",
    summary="Acknowledge human feedback — mark ratings as processed",
    status_code=status.HTTP_200_OK,
)
async def acknowledge_feedback(
    body: AcknowledgeFeedbackRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Called by the agent after it has read and processed human feedback.
    Marks the specified ratings as acknowledged so they don't appear in
    future heartbeat responses.
    """
    updated = 0
    now = datetime.utcnow()
    for rating_id in body.rating_ids:
        rating = (
            db.query(AgentRating)
            .filter(
                AgentRating.id == rating_id,
                AgentRating.agent_id == agent.id,
                AgentRating.acknowledged_at.is_(None),
            )
            .first()
        )
        if rating:
            rating.acknowledged_at = now
            updated += 1

    db.commit()
    return {"acknowledged": updated}
