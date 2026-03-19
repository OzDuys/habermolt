"""Access control helpers for deliberation privacy and user-agent resolution.

Centralises the "is this private? does this user/agent have access?" checks
that were previously duplicated across multiple routers.
"""

from fastapi import HTTPException, Request, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Agent, Deliberation
from app.models.community_member import CommunityMember
from app.models.deliberation_member import DeliberationMember
from app.models.hosted_agent import HostedAgent


def find_user_agent(db: Session, user_id: str) -> Agent | None:
    """Find the user's agent — either a HostedAgent's shadow agent or a claimed OpenClaw agent."""
    hosted = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted and hosted.agent:
        return hosted.agent
    return db.query(Agent).filter(Agent.user_id == user_id).first()


def check_private_access(db: Session, deliberation: Deliberation, agent: Agent):
    """Raise 403 if agent is not a member of a private deliberation.

    For community deliberations, also checks CommunityMember so that
    community members who joined after the deliberation was created
    can still participate.
    """
    if not deliberation.is_private:
        return

    is_member = db.query(DeliberationMember).filter(
        and_(
            DeliberationMember.deliberation_id == deliberation.id,
            DeliberationMember.agent_id == agent.id,
        )
    ).first()
    if is_member:
        return

    # For community deliberations, check community membership as fallback
    if deliberation.community_id and agent.user_id:
        is_community_member = db.query(CommunityMember).filter(
            and_(
                CommunityMember.community_id == deliberation.community_id,
                CommunityMember.user_id == agent.user_id,
            )
        ).first()
        if is_community_member:
            db.add(DeliberationMember(
                deliberation_id=deliberation.id,
                agent_id=agent.id,
                joined_by_user_id=agent.user_id,
            ))
            db.commit()
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not a member of this private deliberation",
    )


def enforce_deliberation_access(
    db: Session,
    deliberation: Deliberation,
    *,
    agent: Agent | None = None,
    request: Request | None = None,
):
    """Check private deliberation access, resolving the agent from the request if needed.

    For endpoints that accept both agent auth (X-API-Key) and human auth
    (X-User-Id), pass both ``agent`` and ``request``. If ``agent`` is provided,
    it's used directly. Otherwise the user_id is extracted from the request
    headers and the user's agent is looked up.

    No-ops for public deliberations.
    """
    if not deliberation.is_private:
        return

    if agent:
        check_private_access(db, deliberation, agent)
        return

    # Try human auth via X-User-Id (only if X-Internal-Secret is valid)
    if request:
        user_id = request.headers.get("X-User-Id")
        if user_id:
            if settings.INTERNAL_API_SECRET:
                internal_secret = request.headers.get("X-Internal-Secret")
                if internal_secret != settings.INTERNAL_API_SECRET:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Authentication required.",
                    )
            user_agent = find_user_agent(db, user_id)
            if user_agent:
                check_private_access(db, deliberation, user_agent)
                return

            # User has no agent — check community membership directly
            if deliberation.community_id:
                is_community_member = db.query(CommunityMember).filter(
                    and_(
                        CommunityMember.community_id == deliberation.community_id,
                        CommunityMember.user_id == user_id,
                    )
                ).first()
                if is_community_member:
                    return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="This is a private deliberation",
    )
