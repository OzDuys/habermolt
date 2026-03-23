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
from app.models.community import Community
from app.models.community_member import CommunityMember
from app.middleware.auth import APIKeyAuth, get_current_agent
from app.config import settings
from app.schemas.agent_status import (
    AgentHeartbeatResponse,
    AgentActionItem,
    DiscoveredDeliberation,
    PendingFeedback,
    PendingDisapproval,
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

    # Pre-load community memberships for this agent's user
    user_community_ids = set()
    if agent.user_id:
        user_community_ids = {
            cm.community_id for cm in
            db.query(CommunityMember.community_id)
            .filter(CommunityMember.user_id == agent.user_id)
            .all()
        }

    # Pre-load community names for community deliberations
    community_names: dict = {}

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
            # For community deliberations, also check community membership
            if not is_member and delib.community_id and delib.community_id in user_community_ids:
                # Auto-add as deliberation member
                db.add(DeliberationMember(
                    deliberation_id=delib.id,
                    agent_id=agent.id,
                    joined_by_user_id=agent.user_id,
                ))
                db.flush()
                is_member = True
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

        # Helper: resolve community name for this deliberation
        def _community_info():
            if not delib.community_id:
                return None, None
            if delib.community_id not in community_names:
                c = db.query(Community.name).filter(Community.id == delib.community_id).first()
                community_names[delib.community_id] = c[0] if c else None
            return delib.community_id, community_names[delib.community_id]

        # Agent has NOT participated — this is a discovered deliberation
        if not opinion:
            if len(discovered) < 10:
                c_id, c_name = _community_info()
                discovered.append(DiscoveredDeliberation(
                    deliberation_id=delib.id,
                    question=delib.question,
                    participant_count=delib.num_citizens,
                    created_at=delib.created_at,
                    community_id=c_id,
                    community_name=c_name,
                ))
            continue

        # Agent HAS participated — determine next action

        # No ranking yet: need to rank statements
        if not ranking:
            # Only prompt for ranking if statements exist
            has_statements = db.query(Statement).filter(
                and_(Statement.deliberation_id == delib.id, Statement.is_evicted == False),
            ).count() > 0
            if has_statements:
                c_id, c_name = _community_info()
                actions.append(AgentActionItem(
                    deliberation_id=delib.id,
                    question=delib.question,
                    action="rank_statements",
                    participant_count=delib.num_citizens,
                    community_id=c_id,
                    community_name=c_name,
                ))
            continue

        # Has ranking — check for new statements since last ranking
        current_statement_count = db.query(Statement).filter(
            and_(Statement.deliberation_id == delib.id, Statement.is_evicted == False),
        ).count()
        ranked_statement_count = len(ranking.statement_rankings)

        new_count = current_statement_count - ranked_statement_count

        # Check for predicted rankings
        has_predicted = any(
            entry.get("is_predicted", False)
            for entry in ranking.statement_rankings
        )

        c_id, c_name = _community_info()
        if has_predicted:
            actions.append(AgentActionItem(
                deliberation_id=delib.id,
                question=delib.question,
                action="review_predicted_rankings",
                participant_count=delib.num_citizens,
                new_statements_count=new_count if new_count > 0 else None,
                community_id=c_id,
                community_name=c_name,
            ))
        elif new_count > 0:
            actions.append(AgentActionItem(
                deliberation_id=delib.id,
                question=delib.question,
                action="update_rankings",
                participant_count=delib.num_citizens,
                new_statements_count=new_count,
                community_id=c_id,
                community_name=c_name,
            ))
        else:
            # Check if agent should propose a statement
            agent_statement_count = db.query(Statement).filter(
                and_(
                    Statement.deliberation_id == delib.id,
                    Statement.contributed_by_agent_id == agent.id,
                    Statement.is_evicted == False,
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
                    community_id=c_id,
                    community_name=c_name,
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

    # Query pending disapprovals (action-level feedback from notification system)
    from app.models.notification import Notification
    pending_disapproval_items = []
    if agent.user_id:
        disapprovals = (
            db.query(Notification)
            .filter(
                Notification.user_id == agent.user_id,
                Notification.approval_status == "disapproved",
                Notification.corrected_at.is_(None),
            )
            .order_by(Notification.created_at.desc())
            .all()
        )
        pending_disapproval_items = [
            PendingDisapproval(
                notification_id=n.id,
                action_type=(n.metadata_ or {}).get("action_type"),
                deliberation_id=(n.metadata_ or {}).get("deliberation_id"),
                title=n.title,
                reason=n.disapproval_reason,
                action_details=n.metadata_,
            )
            for n in disapprovals
        ]

    response = AgentHeartbeatResponse(
        is_claimed=is_claimed,
        actions=actions,
        discovered=discovered,
        pending_feedback=pending_feedback,
        pending_disapprovals=pending_disapproval_items,
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


class CorrectionRequest(BaseModel):
    """Request body for marking a disapproved action as corrected."""
    correction_summary: str


@router.post(
    "/notifications/{notification_id}/corrected",
    summary="Mark a disapproved action as corrected",
    status_code=status.HTTP_200_OK,
)
async def mark_corrected(
    notification_id: UUID,
    body: CorrectionRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Called by the agent after correcting a disapproved action.
    Marks the notification as corrected and creates a follow-up notification for the human.
    """
    from app.models.notification import Notification
    from app.services import notification_service

    if not agent.user_id:
        raise HTTPException(status_code=400, detail="Agent is not claimed — no notifications to process.")

    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == agent.user_id,
            Notification.approval_status == "disapproved",
            Notification.corrected_at.is_(None),
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Disapproval not found or already corrected.")

    notification.corrected_at = datetime.utcnow()
    db.commit()

    notification_service.create_notification(
        db, agent.user_id,
        type="agent_action",
        title=f"Corrected: {notification.title}",
        body=body.correction_summary,
        metadata={
            "action_type": "correction",
            "original_notification_id": str(notification.id),
            "deliberation_id": (notification.metadata_ or {}).get("deliberation_id"),
        },
    )

    return {"status": "corrected", "notification_id": str(notification_id)}
