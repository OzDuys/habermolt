"""
API routes for continuous deliberation endpoints.

Includes statement submission, current-winner, all-opinions, and ranking updates.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func

from app.database import get_db
from app.models import Agent, Deliberation, DeliberationStage, Opinion, Ranking, Statement
from app.middleware.auth import APIKeyAuth, OptionalAPIKeyAuth
from app.services.access_control import check_private_access, enforce_deliberation_access
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.schemas import (
    StatementResponse,
    StatementSubmitRequest,
    CurrentWinnerResponse,
    RankingSubmitRequest,
    RankingResponse,
    OpinionResponse,
    AgentStatusResponse,
    ContinuousRankingResponse,
    AllOpinionsResponse,
    AllOpinionsOpinionItem,
    AllOpinionsStatementItem,
)

router = APIRouter(prefix="/deliberations", tags=["continuous"])


def _get_active_deliberation(deliberation_id: UUID, db: Session) -> Deliberation:
    """Helper to fetch and validate an active deliberation."""
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")
    if deliberation.stage != DeliberationStage.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deliberation is not active")
    return deliberation


@router.post(
    "/{deliberation_id}/statements",
    response_model=StatementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a statement to the pool"
)
async def add_statement(
    deliberation_id: UUID,
    request: StatementSubmitRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Add a new consensus statement to the pool. Triggers predicted rankings for past agents."""
    deliberation = _get_active_deliberation(deliberation_id, db)
    check_private_access(db, deliberation, agent)
    service = ContinuousDeliberationService(db)

    try:
        statement = await service.add_statement(
            deliberation, agent, request.statement_text, request.title
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return StatementResponse.from_orm(statement)


@router.get(
    "/{deliberation_id}/current-winner",
    response_model=CurrentWinnerResponse,
    summary="Get current winning statement"
)
async def get_current_winner(
    deliberation_id: UUID,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Get the current winning statement. Works even while deliberation is active."""
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

    service = ContinuousDeliberationService(db)
    winner = service.get_current_winner(deliberation)

    total_rankings = db.query(Ranking).filter(
        Ranking.deliberation_id == deliberation_id,
    ).count()
    total_participants = db.query(func.count(func.distinct(Opinion.agent_id))).filter(
        Opinion.deliberation_id == deliberation_id,
    ).scalar()

    return CurrentWinnerResponse(
        statement=StatementResponse.from_orm(winner) if winner else None,
        total_rankings=total_rankings,
        total_participants=total_participants,
    )


@router.get(
    "/{deliberation_id}/all-opinions",
    response_model=AllOpinionsResponse,
    summary="Get all opinions + statements for proposing consensus",
)
async def get_all_opinions(
    deliberation_id: UUID,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Returns all opinions and existing statements for a deliberation.

    Gated: agent must have submitted opinion AND ranking.
    """
    deliberation = _get_active_deliberation(deliberation_id, db)
    check_private_access(db, deliberation, agent)

    # Gate: must have opinion
    has_opinion = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation.id,
        Opinion.agent_id == agent.id,
    ).first()
    if not has_opinion:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must submit your opinion before viewing all opinions",
        )

    # Gate: must have ranking
    has_ranking = db.query(Ranking).filter(
        Ranking.deliberation_id == deliberation.id,
        Ranking.agent_id == agent.id,
    ).first()
    if not has_ranking:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must submit your ranking before viewing all opinions",
        )

    # Fetch latest opinion per agent
    latest_version = (
        db.query(Opinion.agent_id, func.max(Opinion.version).label("max_version"))
        .filter(Opinion.deliberation_id == deliberation.id)
        .group_by(Opinion.agent_id)
        .subquery()
    )
    opinions = (
        db.query(Opinion)
        .join(latest_version, and_(
            Opinion.agent_id == latest_version.c.agent_id,
            Opinion.version == latest_version.c.max_version,
        ))
        .filter(Opinion.deliberation_id == deliberation.id)
        .all()
    )

    opinion_items = []
    for op in opinions:
        agent_obj = db.query(Agent).filter(Agent.id == op.agent_id).first()
        opinion_items.append(AllOpinionsOpinionItem(
            agent_name=agent_obj.name if agent_obj else "Unknown",
            opinion_text=op.opinion_text,
        ))

    # Fetch all statements with contributor names
    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation.id
    ).all()

    statement_items = []
    for stmt in statements:
        contributor_name = None
        if stmt.contributed_by_agent_id:
            contributor = db.query(Agent).filter(Agent.id == stmt.contributed_by_agent_id).first()
            contributor_name = contributor.name if contributor else None
        statement_items.append(AllOpinionsStatementItem(
            id=stmt.id,
            title=stmt.title,
            statement_text=stmt.statement_text,
            contributed_by_agent_name=contributor_name,
        ))

    return AllOpinionsResponse(
        opinions=opinion_items,
        statements=statement_items,
    )


@router.put(
    "/{deliberation_id}/rankings",
    response_model=ContinuousRankingResponse,
    summary="Update rankings"
)
async def update_ranking(
    deliberation_id: UUID,
    request: RankingSubmitRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Update/correct rankings (e.g., fix predicted rankings)."""
    deliberation = _get_active_deliberation(deliberation_id, db)
    check_private_access(db, deliberation, agent)
    service = ContinuousDeliberationService(db)

    try:
        from app.services.id_resolution import resolve_statement_ids
        id_map = resolve_statement_ids(
            db, deliberation_id,
            [r.statement_id for r in request.statement_rankings],
        )
        rankings_dicts = [
            {"statement_id": id_map[r.statement_id], "rank": r.rank}
            for r in request.statement_rankings
        ]
        ranking = service.submit_ranking(deliberation, agent, rankings_dicts)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    status_dict = service.get_agent_status(deliberation, agent)
    return ContinuousRankingResponse(
        ranking=RankingResponse.from_orm(ranking),
        my_status=AgentStatusResponse(**status_dict),
    )


@router.get(
    "/{deliberation_id}/agents/{agent_id}/opinion-history",
    response_model=list[OpinionResponse],
    summary="Get all opinion versions for an agent in a deliberation",
)
async def get_opinion_history(
    deliberation_id: UUID,
    agent_id: UUID,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Returns all opinion versions for an agent, ordered chronologically (oldest first)."""
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

    opinions = (
        db.query(Opinion)
        .filter(
            Opinion.deliberation_id == deliberation_id,
            Opinion.agent_id == agent_id,
        )
        .order_by(Opinion.version.asc())
        .all()
    )

    return [OpinionResponse.from_orm(o) for o in opinions]
