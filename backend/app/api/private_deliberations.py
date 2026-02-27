"""
API routes for deliberation creation (human auth), private invites, and joining.

Supports two paths:
1. Human auth (X-User-Id) — for web UI users creating/joining deliberations
2. Agent auth (X-API-Key) — for OpenClaw agents joining via invite link
"""

import logging
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.config import settings
from app.database import get_db
from app.models import Agent, Deliberation, DeliberationStage
from app.models.deliberation_member import DeliberationMember
from app.models.hosted_agent import HostedAgent
from app.middleware.auth import APIKeyAuth
from app.services.content_moderation_service import check_community_guidelines
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.schemas.deliberation import (
    CreatePrivateDeliberationRequest,
    CreatePublicDeliberationRequest,
    InviteInfoResponse,
    JoinDeliberationResponse,
    PrivateDeliberationListItem,
    PrivateDeliberationListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/deliberations", tags=["private-deliberations"])


# --- Auth helper (same pattern as hosted_agents.py) ---

def _require_user_id(req: Request) -> str:
    if settings.INTERNAL_API_SECRET:
        internal_secret = req.headers.get("X-Internal-Secret")
        if internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(status_code=401, detail="Authentication required.")
    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def _find_user_agent(db: Session, user_id: str) -> Agent | None:
    """Find the user's agent — either a HostedAgent's shadow agent or a claimed OpenClaw agent."""
    # Check for hosted agent first
    hosted = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted and hosted.agent:
        return hosted.agent

    # Fall back to directly claimed OpenClaw agent
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    return agent


def check_private_access(db: Session, deliberation: Deliberation, agent: Agent):
    """Raise 403 if agent is not a member of a private deliberation."""
    if not deliberation.is_private:
        return
    is_member = db.query(DeliberationMember).filter(
        and_(
            DeliberationMember.deliberation_id == deliberation.id,
            DeliberationMember.agent_id == agent.id,
        )
    ).first()
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this private deliberation",
        )


# --- Endpoints ---

@router.post(
    "/create-private",
    status_code=status.HTTP_201_CREATED,
    summary="Create a private deliberation (human auth)",
)
async def create_private_deliberation(
    body: CreatePrivateDeliberationRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """
    Create a private deliberation with a shareable invite code.
    Requires human authentication (X-User-Id header).
    """
    user_id = _require_user_id(req)

    # Find the user's agent
    agent = _find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You need an agent to create a deliberation. Create a HaberAgent on your profile page, or link your OpenClaw agent.",
        )

    # Community guidelines check
    passes, _reason = check_community_guidelines(body.question)
    if not passes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This does not meet our community guidelines.",
        )

    # Generate unique invite code
    invite_code = secrets.token_urlsafe(6)

    # Create the deliberation
    deliberation = Deliberation(
        question=body.question,
        stage=DeliberationStage.ACTIVE,
        mechanism_type="continuous",
        created_by_agent_id=agent.id,
        created_by_user_id=user_id,
        is_private=True,
        invite_code=invite_code,
        complexity_tier=body.complexity_tier,
        max_participants=body.max_participants,
        categories=body.categories or [],
        num_citizens=0,
    )
    db.add(deliberation)
    db.flush()

    # Add creator as first member
    member = DeliberationMember(
        deliberation_id=deliberation.id,
        agent_id=agent.id,
        joined_by_user_id=user_id,
    )
    db.add(member)
    db.commit()
    db.refresh(deliberation)

    logger.info(f"Private deliberation created: {deliberation.id} by user {user_id} with invite code {invite_code}")

    return {
        "deliberation_id": str(deliberation.id),
        "question": deliberation.question,
        "invite_code": invite_code,
        "complexity_tier": body.complexity_tier,
        "max_participants": body.max_participants,
        "created_at": deliberation.created_at.isoformat(),
    }


@router.post(
    "/create-public",
    status_code=status.HTTP_201_CREATED,
    summary="Create a public deliberation (human auth)",
)
async def create_public_deliberation(
    body: CreatePublicDeliberationRequest,
    req: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Create a public deliberation.
    Requires human authentication (X-User-Id header).
    User must have an agent (HaberAgent or OpenClaw) to create a deliberation.

    Two paths:
    1. Agent + initial_opinion: full flow (opinion + seed statements)
    2. Agent + no initial_opinion: create deliberation, agent will interview
       the user and submit opinion later (no seed statements yet)
    """
    user_id = _require_user_id(req)

    # Find the user's agent — required for deliberation to function
    agent = _find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You need an agent to create a deliberation. Create a HaberAgent on your profile page, or link your OpenClaw agent.",
        )

    # Community guidelines check
    passes, _reason = check_community_guidelines(body.question)
    if not passes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This does not meet our community guidelines.",
        )

    service = ContinuousDeliberationService(db)

    if body.initial_opinion:
        # Path 1: Agent + opinion — full flow
        try:
            deliberation = await service.create_deliberation(
                question=body.question,
                creator_agent=agent,
                initial_opinion=body.initial_opinion,
                categories=body.categories,
            )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to create public deliberation: {error_msg}", exc_info=True)
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="LLM API rate limit exceeded. Please try again later.",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create deliberation. Please try again later.",
            )
    else:
        # Path 2: No opinion — create shell, agent interviews user later
        deliberation = Deliberation(
            question=body.question,
            mechanism_type="continuous",
            stage=DeliberationStage.ACTIVE,
            created_by_agent_id=agent.id,
            created_by_user_id=user_id,
            num_citizens=0,
            num_critique_rounds=0,
            current_critique_round=0,
            categories=body.categories or [],
            meta_data={},
        )
        db.add(deliberation)
        db.commit()
        db.refresh(deliberation)

    logger.info(f"Public deliberation created: {deliberation.id} by user {user_id} (agent={'yes' if agent else 'no'}, opinion={'yes' if body.initial_opinion else 'no'})")

    return {
        "deliberation_id": str(deliberation.id),
        "question": deliberation.question,
        "created_at": deliberation.created_at.isoformat(),
        "has_agent": agent is not None,
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

    # Count current members
    member_count = db.query(DeliberationMember).filter(
        DeliberationMember.deliberation_id == deliberation.id
    ).count()

    return InviteInfoResponse(
        deliberation_id=str(deliberation.id),
        question=deliberation.question,
        complexity_tier=deliberation.complexity_tier,
        participant_count=member_count,
        max_participants=deliberation.max_participants,
        created_by_name=creator_name,
        created_at=deliberation.created_at,
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
    user_id = _require_user_id(req)

    deliberation = db.query(Deliberation).filter(
        Deliberation.invite_code == invite_code
    ).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    # Find the user's agent
    agent = _find_user_agent(db, user_id)
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

    # Check participant limit
    if deliberation.max_participants:
        current_count = db.query(DeliberationMember).filter(
            DeliberationMember.deliberation_id == deliberation.id
        ).count()
        if current_count >= deliberation.max_participants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This deliberation has reached its participant limit",
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

    # Check participant limit
    if deliberation.max_participants:
        current_count = db.query(DeliberationMember).filter(
            DeliberationMember.deliberation_id == deliberation.id
        ).count()
        if current_count >= deliberation.max_participants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This deliberation has reached its participant limit",
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
    # Community guidelines check
    passes, _reason = check_community_guidelines(body.question)
    if not passes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This does not meet our community guidelines.",
        )

    # Generate unique invite code
    invite_code = secrets.token_urlsafe(6)

    # Create the deliberation
    deliberation = Deliberation(
        question=body.question,
        stage=DeliberationStage.ACTIVE,
        mechanism_type="continuous",
        created_by_agent_id=agent.id,
        is_private=True,
        invite_code=invite_code,
        complexity_tier=body.complexity_tier,
        max_participants=body.max_participants,
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
        "complexity_tier": body.complexity_tier,
        "max_participants": body.max_participants,
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
    user_id = _require_user_id(req)

    agent = _find_user_agent(db, user_id)
    if not agent:
        return PrivateDeliberationListResponse(deliberations=[])

    # Get all private deliberations where the user's agent is a member
    memberships = (
        db.query(DeliberationMember)
        .filter(DeliberationMember.agent_id == agent.id)
        .all()
    )

    delib_ids = [m.deliberation_id for m in memberships]
    if not delib_ids:
        return PrivateDeliberationListResponse(deliberations=[])

    deliberations = (
        db.query(Deliberation)
        .filter(
            and_(
                Deliberation.id.in_(delib_ids),
                Deliberation.is_private == True,
            )
        )
        .order_by(Deliberation.created_at.desc())
        .all()
    )

    items = []
    for d in deliberations:
        member_count = db.query(DeliberationMember).filter(
            DeliberationMember.deliberation_id == d.id
        ).count()
        items.append(PrivateDeliberationListItem(
            id=d.id,
            question=d.question,
            invite_code=d.invite_code,
            complexity_tier=d.complexity_tier,
            participant_count=member_count,
            max_participants=d.max_participants,
            created_at=d.created_at,
            is_creator=d.created_by_user_id == user_id,
        ))

    return PrivateDeliberationListResponse(deliberations=items)
