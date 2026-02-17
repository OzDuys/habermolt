"""
API routes specific to continuous deliberation mechanism.

These endpoints only work with continuous deliberations (mechanism_type = "continuous").
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models import Agent, Deliberation, MechanismType, DeliberationStage
from app.middleware.auth import APIKeyAuth
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.schemas import (
    StatementResponse,
    StatementSubmitRequest,
    CurrentWinnerResponse,
    RankingSubmitRequest,
    RankingResponse,
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
        statement = await service.add_statement(deliberation, agent, request.statement_text)
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


@router.put(
    "/{deliberation_id}/rankings",
    response_model=RankingResponse,
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
        ranking = service.submit_ranking(deliberation, agent, request.statement_rankings)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return RankingResponse.from_orm(ranking)
