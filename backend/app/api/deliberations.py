"""
API routes for deliberation management and participation.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import threading
import asyncio

from app.database import get_db, SessionLocal
from app.models import Agent, Deliberation, DeliberationStage, Opinion, Ranking, Critique, HumanFeedback
from app.middleware.auth import APIKeyAuth
from app.services.deliberation_service import DeliberationService
from app.schemas import (
    DeliberationCreateRequest,
    DeliberationResponse,
    DeliberationListResponse,
    DeliberationDetailResponse,
    OpinionSubmitRequest,
    OpinionResponse,
    StatementResponse,
    RankingSubmitRequest,
    RankingResponse,
    CritiqueSubmitRequest,
    CritiqueResponse,
    HumanFeedbackSubmitRequest,
    HumanFeedbackResponse,
)


router = APIRouter(prefix="/deliberations", tags=["deliberations"])


@router.post(
    "",
    response_model=DeliberationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new deliberation"
)
async def create_deliberation(
    request: DeliberationCreateRequest,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Create a new deliberation session.

    Args:
        request: Deliberation details (question, max_citizens, etc.)
        agent: Authenticated agent (creator)
        db: Database session

    Returns:
        DeliberationResponse with created deliberation details
    """
    service = DeliberationService(db)

    deliberation = service.create_deliberation(
        question=request.question,
        creator_agent=agent,
        max_citizens=request.max_citizens,
        num_critique_rounds=request.num_critique_rounds,
        meta_data=request.meta_data
    )

    return DeliberationResponse.from_orm(deliberation)


@router.get(
    "",
    response_model=DeliberationListResponse,
    summary="List all deliberations (heartbeat endpoint)"
)
async def list_deliberations(
    stage: str = None,
    db: Session = Depends(get_db)
):
    """
    List all deliberations, optionally filtered by stage.

    This is the heartbeat endpoint that agents poll to discover deliberations.

    Args:
        stage: Optional filter by stage (opinion, ranking, critique, concluded, finalized)
        db: Database session

    Returns:
        DeliberationListResponse with list of deliberations
    """
    query = db.query(Deliberation)

    if stage:
        query = query.filter(Deliberation.stage == stage)

    # Order by most recent first
    deliberations = query.order_by(Deliberation.created_at.desc()).all()

    return DeliberationListResponse(
        deliberations=[DeliberationResponse.from_orm(d) for d in deliberations],
        total=len(deliberations)
    )


@router.get(
    "/{deliberation_id}",
    response_model=DeliberationDetailResponse,
    summary="Get deliberation details"
)
async def get_deliberation(
    deliberation_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a deliberation.

    Includes all opinions, statements, rankings, critiques, and feedback.

    Args:
        deliberation_id: UUID of the deliberation
        db: Database session

    Returns:
        DeliberationDetailResponse with full deliberation details
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Fetch the creator agent
    creator = db.query(Agent).filter(Agent.id == deliberation.created_by_agent_id).first()
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator agent not found"
        )

    return DeliberationDetailResponse(
        deliberation=DeliberationResponse.from_orm(deliberation),
        created_by=creator,
        opinions=[OpinionResponse.from_orm(o) for o in deliberation.opinions],
        statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
        rankings=[RankingResponse.from_orm(r) for r in deliberation.rankings],
        critiques=[CritiqueResponse.from_orm(c) for c in deliberation.critiques],
        human_feedback=[HumanFeedbackResponse.from_orm(f) for f in deliberation.human_feedback]
    )


@router.post(
    "/{deliberation_id}/opinions",
    response_model=OpinionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an opinion"
)
async def submit_opinion(
    deliberation_id: UUID,
    request: OpinionSubmitRequest,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit an initial opinion for a deliberation.

    Only valid during the OPINION stage. Each agent can submit exactly one opinion.

    Args:
        deliberation_id: UUID of the deliberation
        request: Opinion text
        background_tasks: FastAPI background tasks
        agent: Authenticated agent
        db: Database session

    Returns:
        OpinionResponse with submitted opinion
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Check if deliberation is accepting opinions
    if deliberation.stage != DeliberationStage.OPINION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is in {deliberation.stage} stage, not accepting opinions"
        )

    # Check if agent already submitted
    existing = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation_id,
        Opinion.agent_id == agent.id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent has already submitted an opinion for this deliberation"
        )

    # Create opinion
    opinion = Opinion(
        deliberation_id=deliberation_id,
        agent_id=agent.id,
        opinion_text=request.opinion_text
    )

    db.add(opinion)
    db.commit()
    db.refresh(opinion)

    # Check for state transition AFTER committing opinion
    # Refresh deliberation to get latest opinions
    db.refresh(deliberation)

    # Update num_citizens to reflect actual participant count
    deliberation.num_citizens = len(deliberation.opinions)
    db.commit()

    # Run transition check - this will block during Habermas Machine (30-60s)
    print(f"[DEBUG] Checking transition: {len(deliberation.opinions)} opinions, max {deliberation.max_citizens}")
    try:
        service = DeliberationService(db)
        result = await service.check_and_transition_state(deliberation)
        print(f"[DEBUG] Transition result: {result}, new stage: {deliberation.stage}")
    except Exception as e:
        print(f"[DEBUG] Transition error: {e}")
        import traceback
        traceback.print_exc()

        # Check if it's a Google API quota error
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Google API quota exceeded. Please update GOOGLE_API_KEY in backend/.env with a new key from https://aistudio.google.com/app/apikey. Error: {error_msg}"
            )

        # For other errors, still fail the request to make issues visible
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process deliberation: {error_msg}"
        )

    return OpinionResponse.from_orm(opinion)


@router.get(
    "/{deliberation_id}/statements",
    response_model=List[StatementResponse],
    summary="Get statements for ranking"
)
async def get_statements(
    deliberation_id: UUID,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Get candidate statements for the current round.

    Only valid during RANKING or CRITIQUE stages.

    Args:
        deliberation_id: UUID of the deliberation
        agent: Authenticated agent
        db: Database session

    Returns:
        List of StatementResponse for current round
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Get statements for current round
    service = DeliberationService(db)
    statements = service.get_current_statements(deliberation)

    return [StatementResponse.from_orm(s) for s in statements]


@router.post(
    "/{deliberation_id}/rankings",
    response_model=RankingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit statement rankings"
)
async def submit_ranking(
    deliberation_id: UUID,
    request: RankingSubmitRequest,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit rankings for candidate statements.

    Only valid during RANKING stage. Each agent submits rankings once per round.

    Args:
        deliberation_id: UUID of the deliberation
        request: Statement rankings
        background_tasks: FastAPI background tasks
        agent: Authenticated agent
        db: Database session

    Returns:
        RankingResponse with submitted rankings
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Check if deliberation is in ranking stage
    if deliberation.stage != DeliberationStage.RANKING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is in {deliberation.stage} stage, not accepting rankings"
        )

    # Check if agent already submitted for this round
    existing = db.query(Ranking).filter(
        Ranking.deliberation_id == deliberation_id,
        Ranking.agent_id == agent.id,
        Ranking.round_number == deliberation.current_critique_round
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent has already submitted rankings for this round"
        )

    # Create ranking
    ranking = Ranking(
        deliberation_id=deliberation_id,
        agent_id=agent.id,
        round_number=deliberation.current_critique_round,
        statement_rankings=request.statement_rankings
    )

    db.add(ranking)
    db.commit()
    db.refresh(ranking)

    # Check for state transition in background with fresh DB session
    def check_transition():
        from app.database import SessionLocal
        fresh_db = SessionLocal()
        try:
            import asyncio
            service = DeliberationService(fresh_db)
            fresh_delib = fresh_db.query(Deliberation).filter(
                Deliberation.id == deliberation_id
            ).first()
            asyncio.run(service.check_and_transition_state(fresh_delib))
        finally:
            fresh_db.close()

    background_tasks.add_task(check_transition)

    return RankingResponse.from_orm(ranking)


@router.post(
    "/{deliberation_id}/critiques",
    response_model=CritiqueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a critique"
)
async def submit_critique(
    deliberation_id: UUID,
    request: CritiqueSubmitRequest,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit a critique of the winning statement.

    Only valid during CRITIQUE stage. Each agent submits one critique per round.

    Args:
        deliberation_id: UUID of the deliberation
        request: Critique text
        background_tasks: FastAPI background tasks
        agent: Authenticated agent
        db: Database session

    Returns:
        CritiqueResponse with submitted critique
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Check if deliberation is in critique stage
    if deliberation.stage != DeliberationStage.CRITIQUE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is in {deliberation.stage} stage, not accepting critiques"
        )

    # Get winning statement
    service = DeliberationService(db)
    winner = service.get_winning_statement(deliberation)

    if not winner:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No winning statement found for current round"
        )

    # Check if agent already submitted for this round
    existing = db.query(Critique).filter(
        Critique.deliberation_id == deliberation_id,
        Critique.agent_id == agent.id,
        Critique.round_number == deliberation.current_critique_round
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent has already submitted a critique for this round"
        )

    # Create critique
    critique = Critique(
        deliberation_id=deliberation_id,
        agent_id=agent.id,
        winning_statement_id=winner.id,
        round_number=deliberation.current_critique_round,
        critique_text=request.critique_text
    )

    db.add(critique)
    db.commit()
    db.refresh(critique)

    # Check for state transition - this will block during Habermas Machine (30-60s)
    db.refresh(deliberation)
    print(f"[DEBUG] Checking critique transition: {len([c for c in deliberation.critiques if c.round_number == deliberation.current_critique_round])} critiques for round {deliberation.current_critique_round}")

    try:
        service = DeliberationService(db)
        result = await service.check_and_transition_state(deliberation)
        print(f"[DEBUG] Transition result: {result}, new stage: {deliberation.stage}")
    except Exception as e:
        print(f"[DEBUG] Transition error: {e}")
        import traceback
        traceback.print_exc()

        # Check if it's a Google API quota error
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Google API quota exceeded. Please update GOOGLE_API_KEY in backend/.env with a new key from https://aistudio.google.com/app/apikey. Error: {error_msg}"
            )

        # For other errors, still fail the request to make issues visible
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process deliberation: {error_msg}"
        )

    return CritiqueResponse.from_orm(critique)


@router.post(
    "/{deliberation_id}/feedback",
    response_model=HumanFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit human feedback"
)
async def submit_feedback(
    deliberation_id: UUID,
    request: HumanFeedbackSubmitRequest,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit human feedback on the final consensus.

    Only valid during CONCLUDED stage. Each agent submits feedback once.

    Args:
        deliberation_id: UUID of the deliberation
        request: Feedback details (agreement_level, feedback_text)
        background_tasks: FastAPI background tasks
        agent: Authenticated agent
        db: Database session

    Returns:
        HumanFeedbackResponse with submitted feedback
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Check if deliberation is concluded
    if deliberation.stage != DeliberationStage.CONCLUDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is in {deliberation.stage} stage, not accepting feedback"
        )

    # Get final statement
    final_statement = deliberation.get_final_statement()

    if not final_statement:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No final statement found"
        )

    # Check if agent already submitted
    existing = db.query(HumanFeedback).filter(
        HumanFeedback.deliberation_id == deliberation_id,
        HumanFeedback.agent_id == agent.id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Agent has already submitted feedback for this deliberation"
        )

    # Create feedback
    feedback = HumanFeedback(
        deliberation_id=deliberation_id,
        agent_id=agent.id,
        final_statement_id=final_statement.id,
        agreement_level=request.agreement_level,
        feedback_text=request.feedback_text
    )

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    # Check for state transition in background with fresh DB session
    def check_transition():
        from app.database import SessionLocal
        fresh_db = SessionLocal()
        try:
            service = DeliberationService(fresh_db)
            fresh_delib = fresh_db.query(Deliberation).filter(
                Deliberation.id == deliberation_id
            ).first()
            service._check_concluded_to_finalized_transition(fresh_delib)
        finally:
            fresh_db.close()

    background_tasks.add_task(check_transition)

    return HumanFeedbackResponse.from_orm(feedback)


@router.post(
    "/{deliberation_id}/reprocess",
    response_model=DeliberationResponse,
    summary="Retry state transition for a stuck deliberation"
)
async def reprocess_deliberation(
    deliberation_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Re-trigger the state transition for a deliberation that got stuck
    (e.g. due to a failed Habermas Machine call).
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    try:
        service = DeliberationService(db)
        result = await service.check_and_transition_state(deliberation)
        print(f"[REPROCESS] Transition result: {result}, new stage: {deliberation.stage}")
    except Exception as e:
        print(f"[REPROCESS] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reprocessing failed: {str(e)}"
        )

    return DeliberationResponse.from_orm(deliberation)


@router.get(
    "/{deliberation_id}/result",
    response_model=DeliberationDetailResponse,
    summary="Get final deliberation results"
)
async def get_result(
    deliberation_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Get complete results of a finalized deliberation.

    Only available for FINALIZED deliberations.

    Args:
        deliberation_id: UUID of the deliberation
        db: Database session

    Returns:
        DeliberationDetailResponse with full results
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    if deliberation.stage != DeliberationStage.FINALIZED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is not finalized yet (current stage: {deliberation.stage})"
        )

    # Fetch the creator agent
    creator = db.query(Agent).filter(Agent.id == deliberation.created_by_agent_id).first()
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator agent not found"
        )

    return DeliberationDetailResponse(
        deliberation=DeliberationResponse.from_orm(deliberation),
        created_by=creator,
        opinions=[OpinionResponse.from_orm(o) for o in deliberation.opinions],
        statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
        rankings=[RankingResponse.from_orm(r) for r in deliberation.rankings],
        critiques=[CritiqueResponse.from_orm(c) for c in deliberation.critiques],
        human_feedback=[HumanFeedbackResponse.from_orm(f) for f in deliberation.human_feedback]
    )
