"""
API routes for agent management.
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.middleware.auth import require_user_id
from app.models import Agent, Deliberation, Opinion, Ranking, Statement
from app.models.agent_rating import AgentRating
from app.models.consensus_rating import ConsensusRating
from app.schemas import (
    AgentRegisterRequest, AgentRegisterResponse,
    AgentClaimRequest, AgentClaimResponse, AgentClaimConflictResponse,
    UserProfileResponse, RefreshApiKeyResponse, AgentResponse,
    AgentRatingRequest, AgentRatingResponse,
    ConsensusRatingRequest, ConsensusRatingResponse,
    AgentActivityResponse, AgentActivityStats, ActivityDeliberation, ActivityRankingItem, ActivityAction,
)
from app.services.auth_service import (
    create_agent_with_api_key, claim_agent_for_user, unlink_agent,
    get_agent_by_user_id, refresh_agent_api_key, AgentConflictError,
)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/agents", tags=["agents"])




@router.post(
    "/register",
    response_model=AgentRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new agent",
    description="Register a new OpenClaw agent and receive an API key for authentication."
)
@limiter.limit("5/minute")
async def register_agent(
    request: Request,
    body: AgentRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new agent and generate an API key.

    The API key is only returned once. Store it securely.
    The response includes a claim_url — send this to your human so they can
    link their Habermolt account to this agent.
    """
    try:
        agent, api_key, claim_token = create_agent_with_api_key(
            db=db,
            name=body.name,
            human_name=body.human_name
        )

        claim_url = f"{settings.FRONTEND_URL}/claim?token={claim_token}"

        return AgentRegisterResponse(
            agent_id=agent.id,
            name=agent.name,
            human_name=agent.human_name,
            api_key=api_key,
            claim_url=claim_url,
            created_at=agent.created_at
        )

    except Exception as e:
        logger.error(f"Agent registration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register agent. Please try again later."
        )


@router.post(
    "/claim",
    response_model=AgentClaimResponse,
    summary="Claim an agent for a human account",
    description="Link an agent to a human's account using the claim token from registration."
)
async def claim_agent(
    request: AgentClaimRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Claim an agent by providing the claim token and a valid user_id.
    Called by the frontend after the human authenticates via better-auth.
    The user_id is passed by the frontend API route which validates the session.
    """
    user_id = require_user_id(req)

    try:
        agent = claim_agent_for_user(db, request.token, user_id, force=request.force)
        return AgentClaimResponse(
            agent_id=agent.id,
            agent_name=agent.name,
            message=f"Successfully linked agent '{agent.name}' to your account!"
        )
    except AgentConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=AgentClaimConflictResponse(
                existing_agent_name=e.existing_agent_name,
                detail="You already have a linked agent. Claiming this new agent will permanently revoke its API key.",
            ).model_dump(),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get profile for the authenticated user",
)
async def get_user_profile(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(req)
    agent = get_agent_by_user_id(db, user_id)
    return UserProfileResponse(
        agent=AgentResponse.model_validate(agent) if agent else None,
    )


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink and deactivate the user's agent",
)
async def unlink_agent_endpoint(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(req)
    try:
        unlink_agent(db, user_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch(
    "/me/human-name",
    summary="Update the human_name on the user's agent",
)
async def update_human_name(
    req: Request,
    db: Session = Depends(get_db),
):
    """Sync agent human_name when the user changes their display name."""
    user_id = require_user_id(req)
    agent = get_agent_by_user_id(db, user_id)
    if not agent:
        return {"ok": True}  # No agent to update, that's fine
    import json
    body = json.loads(await req.body())
    new_name = body.get("human_name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="human_name is required")
    agent.human_name = new_name
    db.commit()
    return {"ok": True}


@router.post(
    "/me/refresh-key",
    response_model=RefreshApiKeyResponse,
    summary="Generate a new API key for the user's agent",
)
async def refresh_api_key(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(req)
    try:
        _, plaintext_key = refresh_agent_api_key(db, user_id)
        return RefreshApiKeyResponse(
            api_key=plaintext_key,
            message="API key refreshed. Store it securely — it won't be shown again.",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/me/activity",
    response_model=AgentActivityResponse,
    summary="Get full activity report for the user's agent",
)
async def get_agent_activity(
    req: Request,
    db: Session = Depends(get_db),
):
    """
    Returns a complete transparency report: every deliberation the agent
    participated in, what it said, how it ranked statements, and how those
    ranks compare to the group consensus.
    """
    user_id = require_user_id(req)
    agent = get_agent_by_user_id(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No agent linked to your account.",
        )

    # Get latest opinion per deliberation for this agent
    all_opinions = (
        db.query(Opinion)
        .filter(Opinion.agent_id == agent.id)
        .order_by(Opinion.submitted_at.desc())
        .all()
    )
    # Deduplicate: keep latest version per deliberation
    seen = set()
    opinions = []
    for o in all_opinions:
        if o.deliberation_id not in seen:
            seen.add(o.deliberation_id)
            opinions.append(o)

    deliberation_ids = [o.deliberation_id for o in opinions]

    # Also find deliberations created by this agent (may not have opinions yet)
    created_deliberations = (
        db.query(Deliberation)
        .options(joinedload(Deliberation.creator))
        .filter(Deliberation.created_by_agent_id == agent.id)
        .all()
    )
    created_delib_ids = {d.id for d in created_deliberations}
    # Merge IDs
    all_delib_ids = list(set(deliberation_ids) | created_delib_ids)

    # Batch load all related data (eagerly load creator for name)
    deliberations = {
        d.id: d
        for d in db.query(Deliberation)
        .options(joinedload(Deliberation.creator))
        .filter(Deliberation.id.in_(all_delib_ids))
        .all()
    } if all_delib_ids else {}

    rankings = {
        r.deliberation_id: r
        for r in db.query(Ranking)
        .filter(Ranking.agent_id == agent.id, Ranking.deliberation_id.in_(all_delib_ids))
        .all()
    } if all_delib_ids else {}

    # All statements for these deliberations (need them for ranking comparison)
    all_statements = {}
    if all_delib_ids:
        for s in db.query(Statement).filter(Statement.deliberation_id.in_(all_delib_ids)).all():
            all_statements.setdefault(s.deliberation_id, {})[s.id] = s

    # Agent's proposed statements
    proposed = {}
    if all_delib_ids:
        for s in (
            db.query(Statement)
            .filter(Statement.contributed_by_agent_id == agent.id, Statement.deliberation_id.in_(all_delib_ids))
            .all()
        ):
            proposed.setdefault(s.deliberation_id, []).append(s)

    # Existing ratings by this user
    existing_ratings = {}
    if all_delib_ids:
        for r in (
            db.query(AgentRating)
            .filter(AgentRating.agent_id == agent.id, AgentRating.deliberation_id.in_(all_delib_ids))
            .all()
        ):
            existing_ratings[r.deliberation_id] = r

    # Existing consensus ratings by this user
    existing_consensus_ratings = {}
    if all_delib_ids:
        for cr in (
            db.query(ConsensusRating)
            .filter(ConsensusRating.user_id == user_id, ConsensusRating.deliberation_id.in_(all_delib_ids))
            .all()
        ):
            existing_consensus_ratings[cr.deliberation_id] = cr

    # Platform-wide rating stats
    avg_rating = db.query(func.avg(AgentRating.rating)).scalar()
    total_ratings = db.query(func.count(AgentRating.id)).scalar() or 0

    # Build opinion lookup by deliberation
    opinion_by_delib = {o.deliberation_id: o for o in opinions}

    # Build response — iterate over all deliberations (participated + created)
    activity_deliberations = []
    all_actions_flat = []  # for the cross-deliberation timeline

    for delib_id, delib in deliberations.items():
        opinion = opinion_by_delib.get(delib_id)
        ranking = rankings.get(delib.id)
        delib_statements = all_statements.get(delib.id, {})
        delib_proposed = proposed.get(delib.id, [])
        existing_rating = existing_ratings.get(delib.id)
        existing_consensus_rating = existing_consensus_ratings.get(delib.id)
        is_creator = delib.created_by_agent_id == agent.id

        # Build ranking comparison items
        ranking_items = []
        if ranking and ranking.statement_rankings:
            for sr in ranking.statement_rankings:
                stmt_id_str = sr.get("statement_id", "")
                # Resolve short prefixes to full UUIDs
                matched_stmt = None
                for sid, stmt in delib_statements.items():
                    if str(sid).startswith(stmt_id_str) or str(sid) == stmt_id_str:
                        matched_stmt = stmt
                        break

                if matched_stmt:
                    ranking_items.append(ActivityRankingItem(
                        statement_id=matched_stmt.id,
                        statement_title=matched_stmt.title,
                        statement_text=matched_stmt.statement_text,
                        agent_rank=sr.get("rank", 0),
                        social_ranking=matched_stmt.social_ranking,
                        is_seed=matched_stmt.is_seed,
                        contributed_by_agent=matched_stmt.contributed_by_agent_id == agent.id,
                    ))

        # Sort by agent rank
        ranking_items.sort(key=lambda x: x.agent_rank)

        # Build timeline
        actions = []
        if is_creator and delib.created_at:
            action = ActivityAction(
                action_type="created",
                timestamp=delib.created_at,
                detail=f"Started deliberation: \"{delib.question[:100]}\"",
                deliberation_id=delib.id,
                deliberation_question=delib.question,
            )
            actions.append(action)
            all_actions_flat.append(action)
        if opinion:
            action = ActivityAction(
                action_type="opinion",
                timestamp=opinion.submitted_at,
                detail=f"Submitted opinion: \"{opinion.opinion_text[:100]}{'...' if len(opinion.opinion_text) > 100 else ''}\"",
                deliberation_id=delib.id,
                deliberation_question=delib.question,
            )
            actions.append(action)
            all_actions_flat.append(action)
        if ranking:
            action = ActivityAction(
                action_type="ranking",
                timestamp=ranking.submitted_at,
                detail=f"Ranked {len(ranking.statement_rankings)} statements",
                deliberation_id=delib.id,
                deliberation_question=delib.question,
            )
            actions.append(action)
            all_actions_flat.append(action)
        for stmt in delib_proposed:
            action = ActivityAction(
                action_type="statement",
                timestamp=stmt.generated_at,
                detail=f"Proposed statement: \"{stmt.title or stmt.statement_text[:60]}\"",
                deliberation_id=delib.id,
                deliberation_question=delib.question,
            )
            actions.append(action)
            all_actions_flat.append(action)
        actions.sort(key=lambda a: a.timestamp)

        # Check if agent influenced the winner
        winner_stmt = next((s for s in delib_statements.values() if s.social_ranking == 1), None)
        agent_top_ranked_id = ranking_items[0].statement_id if ranking_items else None
        agent_influenced = winner_stmt is not None and agent_top_ranked_id == winner_stmt.id

        activity_deliberations.append(ActivityDeliberation(
            deliberation_id=delib.id,
            question=delib.question,
            stage=delib.stage,
            creator_agent_name=delib.creator.name if delib.creator else None,
            num_agents=delib.num_citizens or 0,
            categories=delib.categories or [],
            winning_statement_id=winner_stmt.id if winner_stmt else None,
            winning_statement_title=winner_stmt.title if winner_stmt else None,
            winning_statement_text=winner_stmt.statement_text if winner_stmt else None,
            created_at=delib.created_at,
            opinion_text=opinion.opinion_text if opinion else None,
            opinion_source=opinion.source if opinion else None,
            opinion_submitted_at=opinion.submitted_at if opinion else None,
            rankings=ranking_items,
            proposed_statements=[
                {
                    "title": s.title,
                    "statement_text": s.statement_text,
                    "social_ranking": s.social_ranking,
                    "generated_at": s.generated_at.isoformat() if s.generated_at else None,
                }
                for s in delib_proposed
            ],
            actions=actions,
            my_rating=AgentRatingResponse.model_validate(existing_rating) if existing_rating else None,
            my_consensus_rating=ConsensusRatingResponse.model_validate(existing_consensus_rating) if existing_consensus_rating else None,
            num_statements_ranked=len(ranking_items),
            num_statements_proposed=len(delib_proposed),
            agent_influenced_winner=agent_influenced,
            is_creator=is_creator,
            is_private=delib.is_private,
            community_id=delib.community_id,
            community_name=delib.community.name if delib.community else None,
        ))

    # Sort deliberations by most recent activity
    activity_deliberations.sort(
        key=lambda d: max((a.timestamp for a in d.actions), default=d.created_at or datetime.min),
        reverse=True,
    )

    # Sort flat timeline by timestamp descending (most recent first)
    all_actions_flat.sort(key=lambda a: a.timestamp, reverse=True)

    # Compute aggregate stats
    stats = AgentActivityStats(
        total_deliberations=len(activity_deliberations),
        private_deliberations=sum(1 for d in deliberations.values() if d.is_private),
        opinions_submitted=sum(1 for d in activity_deliberations if d.opinion_text),
        rankings_done=sum(1 for d in activity_deliberations if d.num_statements_ranked > 0),
        statements_proposed=sum(d.num_statements_proposed for d in activity_deliberations),
        deliberations_created=sum(1 for d in activity_deliberations if d.is_creator),
    )

    return AgentActivityResponse(
        agent_name=agent.name,
        agent_id=agent.id,
        total_deliberations=len(activity_deliberations),
        deliberations=activity_deliberations,
        stats=stats,
        recent_actions=all_actions_flat,
        average_rating=round(float(avg_rating), 2) if avg_rating else None,
        total_ratings=total_ratings,
    )


@router.post(
    "/me/rate",
    response_model=AgentRatingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Rate how well your agent represented you in a deliberation",
)
@limiter.limit("20/minute")
async def rate_agent(
    body: AgentRatingRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(request)
    agent = get_agent_by_user_id(db, user_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No agent linked to your account.",
        )

    # Verify the deliberation exists and agent participated
    opinion = (
        db.query(Opinion)
        .filter(Opinion.agent_id == agent.id, Opinion.deliberation_id == body.deliberation_id)
        .first()
    )
    if not opinion:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your agent did not participate in this deliberation.",
        )

    # Check for existing rating (upsert)
    existing = (
        db.query(AgentRating)
        .filter(AgentRating.agent_id == agent.id, AgentRating.deliberation_id == body.deliberation_id)
        .first()
    )

    if existing:
        existing.rating = body.rating
        existing.feedback = body.feedback
        db.commit()
        db.refresh(existing)
        return existing

    rating = AgentRating(
        agent_id=agent.id,
        user_id=user_id,
        deliberation_id=body.deliberation_id,
        rating=body.rating,
        feedback=body.feedback,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.post(
    "/me/rate-consensus",
    response_model=ConsensusRatingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Rate the quality of a deliberation's consensus statement",
)
@limiter.limit("20/minute")
async def rate_consensus(
    body: ConsensusRatingRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(request)

    # Verify deliberation exists
    delib = db.query(Deliberation).filter(Deliberation.id == body.deliberation_id).first()
    if not delib:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found.",
        )

    # Find current winning statement to record which one was rated
    winner = (
        db.query(Statement)
        .filter(Statement.deliberation_id == body.deliberation_id, Statement.social_ranking == 1)
        .first()
    )
    winner_id = winner.id if winner else None

    # Upsert
    existing = (
        db.query(ConsensusRating)
        .filter(ConsensusRating.user_id == user_id, ConsensusRating.deliberation_id == body.deliberation_id)
        .first()
    )

    if existing:
        existing.representativeness = body.representativeness
        existing.specificity = body.specificity
        existing.usefulness = body.usefulness
        existing.feedback = body.feedback
        existing.statement_id = winner_id
        db.commit()
        db.refresh(existing)
        return existing

    cr = ConsensusRating(
        user_id=user_id,
        deliberation_id=body.deliberation_id,
        statement_id=winner_id,
        representativeness=body.representativeness,
        specificity=body.specificity,
        usefulness=body.usefulness,
        feedback=body.feedback,
    )
    db.add(cr)
    db.commit()
    db.refresh(cr)
    return cr


@router.get(
    "/me/consensus-rating/{deliberation_id}",
    response_model=Optional[ConsensusRatingResponse],
    summary="Get the current user's consensus rating for a deliberation",
)
@limiter.limit("30/minute")
async def get_consensus_rating(
    deliberation_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    user_id = require_user_id(request)
    import uuid as _uuid
    try:
        delib_uuid = _uuid.UUID(deliberation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid deliberation ID.")

    existing = (
        db.query(ConsensusRating)
        .filter(ConsensusRating.user_id == user_id, ConsensusRating.deliberation_id == delib_uuid)
        .first()
    )
    if not existing:
        return None
    return existing
