"""
API routes for communities — persistent groups of users for ongoing deliberations.

All endpoints use human auth (X-User-Id) since communities are human-managed.
"""

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.config import settings
from app.database import get_db
from app.models import Agent, Deliberation, DeliberationStage, Opinion
from app.models.community import Community
from app.models.community_member import CommunityMember
from app.models.deliberation_member import DeliberationMember
from app.models.hosted_agent import HostedAgent
from app.schemas.community import (
    CreateCommunityRequest,
    CommunityResponse,
    CommunityDetailResponse,
    CommunityMemberResponse,
    CommunityInviteInfoResponse,
    JoinCommunityResponse,
    CreateCommunityDeliberationRequest,
    UpdateCommunityRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/communities", tags=["communities"])


# --- Auth helper (same pattern as private_deliberations.py) ---

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
    hosted = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted and hosted.agent:
        return hosted.agent
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    return agent


# --- Endpoints ---

@router.post(
    "",
    response_model=CommunityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a community",
)
async def create_community(
    body: CreateCommunityRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Create a new community. The creator becomes an admin member."""
    user_id = _require_user_id(req)

    invite_code = secrets.token_urlsafe(8)

    community = Community(
        name=body.name,
        description=body.description,
        invite_code=invite_code,
        created_by_user_id=user_id,
    )
    db.add(community)
    db.flush()

    # Find user's agent (optional — they might not have one yet)
    agent = _find_user_agent(db, user_id)

    member = CommunityMember(
        community_id=community.id,
        user_id=user_id,
        agent_id=agent.id if agent else None,
        role="admin",
    )
    db.add(member)
    db.commit()
    db.refresh(community)

    logger.info(f"Community created: {community.id} '{community.name}' by user {user_id}")

    return CommunityResponse(
        id=community.id,
        name=community.name,
        description=community.description,
        invite_code=community.invite_code,
        member_count=1,
        deliberation_count=0,
        created_at=community.created_at,
    )


@router.get(
    "/my",
    response_model=list[CommunityResponse],
    summary="List user's communities",
)
async def list_my_communities(
    req: Request,
    db: Session = Depends(get_db),
):
    """List all communities the user belongs to."""
    user_id = _require_user_id(req)

    memberships = (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == user_id)
        .all()
    )

    community_ids = [m.community_id for m in memberships]
    if not community_ids:
        return []

    communities = (
        db.query(Community)
        .filter(Community.id.in_(community_ids))
        .order_by(Community.created_at.desc())
        .all()
    )

    results = []
    for c in communities:
        member_count = db.query(CommunityMember).filter(
            CommunityMember.community_id == c.id
        ).count()
        delib_count = db.query(Deliberation).filter(
            Deliberation.community_id == c.id
        ).count()
        results.append(CommunityResponse(
            id=c.id,
            name=c.name,
            description=c.description,
            invite_code=c.invite_code,
            member_count=member_count,
            deliberation_count=delib_count,
            created_at=c.created_at,
        ))

    return results


@router.get(
    "/invite/{code}",
    response_model=CommunityInviteInfoResponse,
    summary="Get community invite info (public)",
)
async def get_community_invite_info(
    code: str,
    db: Session = Depends(get_db),
):
    """Get public info about a community via invite code. No auth required."""
    community = db.query(Community).filter(Community.invite_code == code).first()
    if not community:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    member_count = db.query(CommunityMember).filter(
        CommunityMember.community_id == community.id
    ).count()

    return CommunityInviteInfoResponse(
        community_id=community.id,
        name=community.name,
        description=community.description,
        member_count=member_count,
    )


@router.post(
    "/join/{code}",
    response_model=JoinCommunityResponse,
    summary="Join a community via invite code",
)
async def join_community(
    code: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Join a community using an invite code."""
    user_id = _require_user_id(req)

    community = db.query(Community).filter(Community.invite_code == code).first()
    if not community:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    # Check if already a member
    existing = db.query(CommunityMember).filter(
        and_(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == user_id,
        )
    ).first()
    if existing:
        return JoinCommunityResponse(
            community_id=str(community.id),
            message="You are already a member of this community",
        )

    # Find user's agent
    agent = _find_user_agent(db, user_id)

    member = CommunityMember(
        community_id=community.id,
        user_id=user_id,
        agent_id=agent.id if agent else None,
        role="member",
    )
    db.add(member)

    # Also add the agent as a member to all existing community deliberations
    if agent:
        delib_ids = [
            d.id for d in
            db.query(Deliberation.id).filter(Deliberation.community_id == community.id).all()
        ]
        for delib_id in delib_ids:
            exists = db.query(DeliberationMember).filter(
                and_(
                    DeliberationMember.deliberation_id == delib_id,
                    DeliberationMember.agent_id == agent.id,
                )
            ).first()
            if not exists:
                db.add(DeliberationMember(
                    deliberation_id=delib_id,
                    agent_id=agent.id,
                    joined_by_user_id=user_id,
                ))

    db.commit()

    logger.info(f"User {user_id} joined community {community.id} '{community.name}'")

    return JoinCommunityResponse(
        community_id=str(community.id),
        message="Successfully joined the community",
    )


@router.post(
    "/{community_id}/leave",
    summary="Leave a community",
)
async def leave_community(
    community_id: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Leave a community. Removes membership and access to community deliberations."""
    user_id = _require_user_id(req)

    member = db.query(CommunityMember).filter(
        and_(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this community")

    # Block if last admin
    if member.role == "admin":
        admin_count = db.query(CommunityMember).filter(
            and_(
                CommunityMember.community_id == community_id,
                CommunityMember.role == "admin",
            )
        ).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="You are the last admin. Transfer the admin role to another member before leaving.",
            )

    # Remove community membership
    db.delete(member)

    # Remove deliberation memberships for this community
    agent = _find_user_agent(db, user_id)
    if agent:
        delib_ids = [
            d.id for d in
            db.query(Deliberation.id).filter(Deliberation.community_id == community_id).all()
        ]
        if delib_ids:
            db.query(DeliberationMember).filter(
                and_(
                    DeliberationMember.agent_id == agent.id,
                    DeliberationMember.deliberation_id.in_(delib_ids),
                )
            ).delete(synchronize_session=False)

    db.commit()

    logger.info(f"User {user_id} left community {community_id}")

    return {"message": "Successfully left the community"}


@router.get(
    "/{community_id}",
    response_model=CommunityDetailResponse,
    summary="Get community detail (must be member)",
)
async def get_community_detail(
    community_id: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Get detailed community info including members and deliberations. Must be a member."""
    user_id = _require_user_id(req)

    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check membership
    is_member = db.query(CommunityMember).filter(
        and_(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == user_id,
        )
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this community")

    # Get members with agent names
    members_rows = (
        db.query(CommunityMember, Agent.name)
        .outerjoin(Agent, Agent.id == CommunityMember.agent_id)
        .filter(CommunityMember.community_id == community.id)
        .order_by(CommunityMember.joined_at)
        .all()
    )
    members = [
        CommunityMemberResponse(
            user_id=m.user_id,
            agent_name=agent_name,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m, agent_name in members_rows
    ]

    delib_count = db.query(Deliberation).filter(
        Deliberation.community_id == community.id
    ).count()

    return CommunityDetailResponse(
        id=community.id,
        name=community.name,
        description=community.description,
        invite_code=community.invite_code,
        member_count=len(members),
        members=members,
        deliberation_count=delib_count,
        created_at=community.created_at,
        my_role=is_member.role,
    )


@router.patch(
    "/{community_id}",
    response_model=CommunityDetailResponse,
    summary="Update community name/description (admin only)",
)
async def update_community(
    community_id: str,
    body: UpdateCommunityRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Update a community's name and/or description. Must be an admin."""
    user_id = _require_user_id(req)

    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    member = db.query(CommunityMember).filter(
        and_(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this community")
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can edit community details")

    if body.name is not None:
        community.name = body.name
    if body.description is not None:
        community.description = body.description

    db.commit()
    db.refresh(community)

    logger.info(f"Community {community_id} updated by admin {user_id}")

    # Return full detail response
    members_rows = (
        db.query(CommunityMember, Agent.name)
        .outerjoin(Agent, Agent.id == CommunityMember.agent_id)
        .filter(CommunityMember.community_id == community.id)
        .order_by(CommunityMember.joined_at)
        .all()
    )
    members = [
        CommunityMemberResponse(
            user_id=m.user_id,
            agent_name=agent_name,
            role=m.role,
            joined_at=m.joined_at,
        )
        for m, agent_name in members_rows
    ]
    delib_count = db.query(Deliberation).filter(
        Deliberation.community_id == community.id
    ).count()

    return CommunityDetailResponse(
        id=community.id,
        name=community.name,
        description=community.description,
        invite_code=community.invite_code,
        member_count=len(members),
        members=members,
        deliberation_count=delib_count,
        created_at=community.created_at,
        my_role=member.role,
    )


@router.post(
    "/{community_id}/deliberations",
    status_code=status.HTTP_201_CREATED,
    summary="Create a deliberation in a community",
)
async def create_community_deliberation(
    community_id: str,
    body: CreateCommunityDeliberationRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Create a deliberation scoped to a community. Must be a member."""
    user_id = _require_user_id(req)

    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    # Check membership
    is_member = db.query(CommunityMember).filter(
        and_(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == user_id,
        )
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this community")

    agent = _find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=400,
            detail="You need an agent to create a deliberation.",
        )

    # Create the deliberation (private + community-scoped)
    invite_code = secrets.token_urlsafe(6)
    deliberation = Deliberation(
        question=body.question,
        stage=DeliberationStage.ACTIVE,
        mechanism_type="continuous",
        created_by_agent_id=agent.id,
        created_by_user_id=user_id,
        is_private=True,
        invite_code=invite_code,
        community_id=community.id,
        categories=body.categories or [],
        num_citizens=0,
        meta_data={},
    )
    db.add(deliberation)
    db.flush()

    # Add all community members' agents as deliberation members
    community_members = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == community.id)
        .all()
    )
    for cm in community_members:
        if cm.agent_id:
            db.add(DeliberationMember(
                deliberation_id=deliberation.id,
                agent_id=cm.agent_id,
                joined_by_user_id=cm.user_id,
            ))

    db.commit()
    db.refresh(deliberation)

    logger.info(
        f"Community deliberation created: {deliberation.id} in community {community.id} by user {user_id}"
    )

    return {
        "deliberation_id": str(deliberation.id),
        "question": deliberation.question,
        "community_id": str(community.id),
        "created_at": deliberation.created_at.isoformat(),
    }
