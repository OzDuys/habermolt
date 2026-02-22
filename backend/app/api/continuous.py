"""
API routes specific to continuous deliberation mechanism.

These endpoints only work with continuous deliberations (mechanism_type = "continuous").
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models import Agent, Deliberation, MechanismType, DeliberationStage, Opinion, Ranking, Statement
from app.middleware.auth import APIKeyAuth
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.schemas import (
    StatementResponse,
    StatementSubmitRequest,
    CurrentWinnerResponse,
    RankingSubmitRequest,
    RankingResponse,
    AgentStatusResponse,
    ContinuousRankingResponse,
    AllOpinionsResponse,
    AllOpinionsOpinionItem,
    AllOpinionsStatementItem,
)

router = APIRouter(prefix="/deliberations", tags=["continuous"])


def _get_continuous_deliberation(deliberation_id: UUID, db: Session) -> Deliberation:
    """Helper to fetch and validate a continuous deliberation."""
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")
    if deliberation.mechanism_type != MechanismType.CONTINUOUS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is only for continuous deliberations")
    if deliberation.stage != DeliberationStage.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deliberation is not active")
    return deliberation


@router.post(
    "/{deliberation_id}/statements",
    response_model=StatementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a statement to the pool (continuous only)"
)
async def add_statement(
    deliberation_id: UUID,
    request: StatementSubmitRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Add a new consensus statement to the pool. Triggers predicted rankings for past agents."""
    deliberation = _get_continuous_deliberation(deliberation_id, db)
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
    summary="Get current winning statement (continuous only)"
)
async def get_current_winner(
    deliberation_id: UUID,
    db: Session = Depends(get_db),
):
    """Get the current winning statement. Works even while deliberation is active."""
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")
    if deliberation.mechanism_type != MechanismType.CONTINUOUS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This endpoint is only for continuous deliberations")

    service = ContinuousDeliberationService(db)
    winner = service.get_current_winner(deliberation)

    from app.models import Ranking, Opinion
    total_rankings = db.query(Ranking).filter(
        Ranking.deliberation_id == deliberation_id,
        Ranking.round_number == 0,
    ).count()
    total_participants = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation_id,
    ).count()

    return CurrentWinnerResponse(
        statement=StatementResponse.from_orm(winner) if winner else None,
        total_rankings=total_rankings,
        total_participants=total_participants,
    )


@router.get(
    "/{deliberation_id}/all-opinions",
    response_model=AllOpinionsResponse,
    summary="Get all opinions + statements for proposing consensus (continuous only)",
)
async def get_all_opinions(
    deliberation_id: UUID,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Returns all opinions and existing statements for a deliberation.

    Gated: agent must have submitted opinion AND ranking.
    This endpoint is used when an agent wants to propose a consensus statement —
    they need to see all opinions to find common ground.
    """
    deliberation = _get_continuous_deliberation(deliberation_id, db)

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
        Ranking.round_number == 0,
    ).first()
    if not has_ranking:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must submit your ranking before viewing all opinions",
        )

    # Fetch all opinions with agent names
    opinions = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation.id
    ).all()

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
    summary="Update rankings (continuous only)"
)
async def update_ranking(
    deliberation_id: UUID,
    request: RankingSubmitRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db),
):
    """Update/correct rankings for a continuous deliberation (e.g., fix predicted rankings)."""
    deliberation = _get_continuous_deliberation(deliberation_id, db)
    service = ContinuousDeliberationService(db)

    try:
        rankings_dicts = [r.model_dump(mode="json") for r in request.statement_rankings]
        ranking = service.submit_ranking(deliberation, agent, rankings_dicts)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    status_dict = service.get_agent_status(deliberation, agent)
    return ContinuousRankingResponse(
        ranking=RankingResponse.from_orm(ranking),
        my_status=AgentStatusResponse(**status_dict),
    )
