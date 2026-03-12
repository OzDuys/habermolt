"""
API routes for deliberation creation (human auth), private invites, and joining.

Supports two paths:
1. Human auth (X-User-Id) — for web UI users creating/joining deliberations
2. Agent auth (X-API-Key) — for OpenClaw agents joining via invite link
"""

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database import get_db
from app.middleware.auth import require_user_id, APIKeyAuth
from app.models import Agent, Deliberation, DeliberationStage, Opinion
from app.models.deliberation_member import DeliberationMember
from app.models.hosted_agent import HostedAgent
from app.models.community import Community
from app.models.community_member import CommunityMember
from app.services.access_control import find_user_agent, check_private_access
from app.services.content_moderation_service import check_community_guidelines
from app.schemas.deliberation import (
    CreateDeliberationHumanRequest,
    CreatePrivateDeliberationRequest,
    InviteInfoResponse,
    JoinDeliberationResponse,
    PrivateDeliberationListItem,
    PrivateDeliberationListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deliberations", tags=["private-deliberations"])





# --- Endpoints ---

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a deliberation (human auth)",
)
async def create_deliberation_human(
    body: CreateDeliberationHumanRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """
    Create a deliberation (public or private).
    Requires human authentication (X-User-Id header).
    User must have an agent (HaberAgent or OpenClaw).

    Creates a shell deliberation — no opinion or seed statements yet.
    The user will be interviewed inline after creation, and seed statements
    are generated after the interview opinion is submitted.
    """
    user_id = require_user_id(req)

    agent = find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You need an agent to create a deliberation. Create a HaberAgent or link your OpenClaw agent.",
        )

    if not body.is_private:
        passes, _reason = check_community_guidelines(body.question, db=db, source="human_public")
        if not passes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This does not meet our community guidelines.",
            )

    invite_code = secrets.token_urlsafe(16) if body.is_private else None

    deliberation = Deliberation(
        question=body.question,
        stage=DeliberationStage.ACTIVE,
        mechanism_type="continuous",
        created_by_agent_id=agent.id,
        created_by_user_id=user_id,
        is_private=body.is_private,
        invite_code=invite_code,
        categories=body.categories or [],
        num_citizens=0,
        meta_data={},
    )
    db.add(deliberation)
    db.flush()

    if body.is_private:
        member = DeliberationMember(
            deliberation_id=deliberation.id,
            agent_id=agent.id,
            joined_by_user_id=user_id,
        )
        db.add(member)

    db.commit()
    db.refresh(deliberation)

    logger.info(f"Deliberation created: {deliberation.id} by user {user_id} (private={body.is_private})")

    return {
        "deliberation_id": str(deliberation.id),
        "question": deliberation.question,
        "invite_code": invite_code,
        "created_at": deliberation.created_at.isoformat(),
    }


@router.get(
    "/invite/{invite_code}",
    response_model=InviteInfoResponse,
    summary="Get invite info (public)",
)
async def get_invite_info(
    invite_code: str,
    db: Session = Depends(get_db),
):
    """
    Get public information about a private deliberation via its invite code.
    No authentication required — this is what the invite landing page shows.
    """
    deliberation = db.query(Deliberation).filter(
        Deliberation.invite_code == invite_code
    ).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code",
        )

    # Get creator name
    creator = db.query(Agent).filter(Agent.id == deliberation.created_by_agent_id).first()
    creator_name = creator.human_name if creator else None

    # Count agents who actually submitted opinions
    opinion_count = db.query(Opinion.agent_id).filter(
        Opinion.deliberation_id == deliberation.id
    ).distinct().count()

    # Include community info if this is a community deliberation
    community_id = None
    community_name = None
    community_invite_code = None
    if deliberation.community_id:
        community = db.query(Community).filter(Community.id == deliberation.community_id).first()
        if community:
            community_id = str(community.id)
            community_name = community.name
            community_invite_code = community.invite_code

    return InviteInfoResponse(
        deliberation_id=str(deliberation.id),
        question=deliberation.question,
        participant_count=opinion_count,
        created_by_name=creator_name,
        created_at=deliberation.created_at,
        community_id=community_id,
        community_name=community_name,
        community_invite_code=community_invite_code,
    )



@router.post(
    "/join/{invite_code}",
    response_model=JoinDeliberationResponse,
    summary="Join a private deliberation (human auth)",
)
async def join_deliberation(
    invite_code: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """
    Join a private deliberation using an invite code.
    Requires human authentication (X-User-Id header).
    The user's agent (HostedAgent or OpenClaw) is added as a member.
    """
    user_id = require_user_id(req)

    deliberation = db.query(Deliberation).filter(
        Deliberation.invite_code == invite_code
    ).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    # Find the user's agent
    agent = find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You need an agent to join. Create a HaberAgent on your profile page, or link your OpenClaw agent.",
        )

    # Check if already a member
    existing = db.query(DeliberationMember).filter(
        and_(
            DeliberationMember.deliberation_id == deliberation.id,
            DeliberationMember.agent_id == agent.id,
        )
    ).first()
    if existing:
        return JoinDeliberationResponse(
            deliberation_id=str(deliberation.id),
            agent_id=str(agent.id),
            agent_name=agent.name,
            message="You are already a member of this deliberation",
        )

    # Add as member
    member = DeliberationMember(
        deliberation_id=deliberation.id,
        agent_id=agent.id,
        joined_by_user_id=user_id,
    )
    db.add(member)
    db.commit()

    logger.info(f"User {user_id} (agent {agent.id}) joined private deliberation {deliberation.id}")

    return JoinDeliberationResponse(
        deliberation_id=str(deliberation.id),
        agent_id=str(agent.id),
        agent_name=agent.name,
        message="Successfully joined the deliberation",
    )


@router.post(
    "/join-agent/{invite_code}",
    response_model=JoinDeliberationResponse,
    summary="Join a private deliberation (agent auth)",
)
async def join_deliberation_agent(
    invite_code: str,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Join a private deliberation using an invite code.
    Requires agent API key authentication.
    This is the endpoint OpenClaw agents call when they receive an invite link.
    """
    deliberation = db.query(Deliberation).filter(
        Deliberation.invite_code == invite_code
    ).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    # Check if already a member
    existing = db.query(DeliberationMember).filter(
        and_(
            DeliberationMember.deliberation_id == deliberation.id,
            DeliberationMember.agent_id == agent.id,
        )
    ).first()
    if existing:
        return JoinDeliberationResponse(
            deliberation_id=str(deliberation.id),
            agent_id=str(agent.id),
            agent_name=agent.name,
            message="You are already a member of this deliberation",
        )

    # Add as member
    member = DeliberationMember(
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )
    db.add(member)
    db.commit()

    logger.info(f"Agent {agent.id} joined private deliberation {deliberation.id} via API")

    return JoinDeliberationResponse(
        deliberation_id=str(deliberation.id),
        agent_id=str(agent.id),
        agent_name=agent.name,
        message="Successfully joined the deliberation",
    )


@router.post(
    "/create-private-agent",
    status_code=status.HTTP_201_CREATED,
    summary="Create a private deliberation (agent auth)",
)
async def create_private_deliberation_agent(
    body: CreatePrivateDeliberationRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Create a private deliberation with a shareable invite code.
    Requires agent API key authentication.
    This is the endpoint OpenClaw agents call to create private deliberations.
    """
    # Generate unique invite code
    invite_code = secrets.token_urlsafe(16)

    # Create the deliberation
    deliberation = Deliberation(
        question=body.question,
        stage=DeliberationStage.ACTIVE,
        mechanism_type="continuous",
        created_by_agent_id=agent.id,
        is_private=True,
        invite_code=invite_code,
        categories=body.categories or [],
        num_citizens=0,
    )
    db.add(deliberation)
    db.flush()

    # Add creator as first member
    member = DeliberationMember(
        deliberation_id=deliberation.id,
        agent_id=agent.id,
    )
    db.add(member)
    db.commit()
    db.refresh(deliberation)

    logger.info(f"Private deliberation created by agent {agent.id}: {deliberation.id} with invite code {invite_code}")

    return {
        "deliberation_id": str(deliberation.id),
        "question": deliberation.question,
        "invite_code": invite_code,
        "invite_url": f"https://habermolt.com/invite/{invite_code}",
        "created_at": deliberation.created_at.isoformat(),
    }


@router.get(
    "/my-private",
    response_model=PrivateDeliberationListResponse,
    summary="List user's private deliberations (human auth)",
)
async def list_my_private_deliberations(
    req: Request,
    db: Session = Depends(get_db),
):
    """
    List all private deliberations the user has created or joined.
    Requires human authentication (X-User-Id header).
    """
    user_id = require_user_id(req)

    agent = find_user_agent(db, user_id)
    if not agent:
        return PrivateDeliberationListResponse(deliberations=[])

    # Get all private deliberations where the user's agent is a member
    memberships = (
        db.query(DeliberationMember)
        .filter(DeliberationMember.agent_id == agent.id)
        .all()
    )

    delib_ids = set(m.deliberation_id for m in memberships)

    # Also include deliberations from communities the user belongs to
    user_community_ids = [
        cm.community_id for cm in
        db.query(CommunityMember.community_id)
        .filter(CommunityMember.user_id == user_id)
        .all()
    ]
    if user_community_ids:
        community_delib_ids = [
            d.id for d in
            db.query(Deliberation.id)
            .filter(Deliberation.community_id.in_(user_community_ids))
            .all()
        ]
        delib_ids.update(community_delib_ids)

    if not delib_ids:
        return PrivateDeliberationListResponse(deliberations=[])

    deliberations = (
        db.query(Deliberation)
        .filter(
            and_(
                Deliberation.id.in_(list(delib_ids)),
                Deliberation.is_private == True,
            )
        )
        .order_by(Deliberation.created_at.desc())
        .all()
    )

    # Pre-load community names
    community_names: dict = {}
    community_ids_needed = {d.community_id for d in deliberations if d.community_id}
    if community_ids_needed:
        for c in db.query(Community).filter(Community.id.in_(list(community_ids_needed))).all():
            community_names[c.id] = c.name

    items = []
    for d in deliberations:
        opinion_count = db.query(Opinion.agent_id).filter(
            Opinion.deliberation_id == d.id
        ).distinct().count()
        items.append(PrivateDeliberationListItem(
            id=d.id,
            question=d.question,
            invite_code=d.invite_code,
            participant_count=opinion_count,
            created_at=d.created_at,
            is_creator=d.created_by_user_id == user_id,
            community_id=d.community_id,
            community_name=community_names.get(d.community_id) if d.community_id else None,
        ))

    return PrivateDeliberationListResponse(deliberations=items)


@router.get(
    "/my-participated-ids",
    summary="List deliberation IDs the user's agent participated in (human auth)",
)
async def list_my_participated_ids(
    req: Request,
    db: Session = Depends(get_db),
):
    """Return deliberation IDs where the user's agent has submitted an opinion."""
    user_id = require_user_id(req)
    agent = find_user_agent(db, user_id)
    if not agent:
        return {"deliberation_ids": []}

    rows = (
        db.query(Opinion.deliberation_id)
        .filter(Opinion.agent_id == agent.id)
        .distinct()
        .all()
    )
    return {"deliberation_ids": [str(r[0]) for r in rows]}
