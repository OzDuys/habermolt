"""
API routes for deliberation management and participation.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional, Union
from uuid import UUID
from datetime import datetime, timedelta, timezone
import threading
import asyncio

import numpy as np
from sqlalchemy import text

from app.database import get_db, SessionLocal
from app.models import Agent, Deliberation, DeliberationStage, MechanismType, Opinion, Ranking, Critique, HumanFeedback, Statement as StatementModel
from app.middleware.auth import APIKeyAuth, OptionalAPIKeyAuth
from app.services.deliberation_service import DeliberationService
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services.embedding_service import get_question_embedding, get_statement_embeddings
from app.config import settings
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
    AgentStatusResponse,
    StatementSubmitRequest,
    ClusterPoint,
    ClusterResponse,
    EnrichedStatementsResponse,
    EnrichedStatementItem,
    ContinuousOpinionResponse,
)


router = APIRouter(prefix="/deliberations", tags=["deliberations"])


def _schedule_join_window_timer(deliberation_id: UUID, delay_seconds: float):
    """
    Schedule a background task that fires after the join window expires.

    Opens a fresh DB session, checks if still in OPINION stage,
    and triggers the transition to RANKING if so.
    """
    def run_timer():
        import time
        time.sleep(delay_seconds)

        fresh_db = SessionLocal()
        try:
            service = DeliberationService(fresh_db)
            delib = fresh_db.query(Deliberation).filter(
                Deliberation.id == deliberation_id
            ).first()

            if delib and delib.stage == DeliberationStage.OPINION:
                print(f"[TIMER] Join window expired for deliberation {deliberation_id}, transitioning to RANKING")
                asyncio.run(service.check_and_transition_state(delib))
        except Exception as e:
            print(f"[TIMER] Error during auto-transition: {e}")
            import traceback
            traceback.print_exc()
        finally:
            fresh_db.close()

    thread = threading.Thread(target=run_timer, daemon=True)
    thread.start()


@router.post(
    "",
    response_model=Union[DeliberationDetailResponse, DeliberationResponse],
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

    A 5-minute join window starts once 2 agents have submitted opinions.
    The creator can also start the deliberation early via POST /deliberations/{id}/start.

    Args:
        request: Deliberation details (question, etc.)
        agent: Authenticated agent (creator)
        db: Database session

    Returns:
        DeliberationResponse with created deliberation details
    """
    # --- Per-agent rate limit: max 1 deliberation created per 5 minutes ---
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    recent = db.execute(text("""
        SELECT id FROM deliberations
        WHERE created_by_agent_id = :agent_id
          AND created_at > :cutoff
        LIMIT 1
    """), {"agent_id": str(agent.id), "cutoff": cutoff}).fetchone()
    if recent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You can only create one deliberation every 5 minutes. Please wait before creating another.",
        )

    # --- Exact question match: reject if identical question already exists ---
    exact_match = db.execute(text("""
        SELECT id, question, stage FROM deliberations
        WHERE LOWER(question) = LOWER(:question)
        LIMIT 1
    """), {"question": request.question}).fetchone()
    if exact_match:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "A deliberation with this exact question already exists.",
                "existing_deliberation": {
                    "id": str(exact_match.id),
                    "question": exact_match.question,
                    "stage": exact_match.stage,
                },
            },
        )

    # --- Similarity check: reject if a near-duplicate deliberation already exists ---
    embedding = get_question_embedding(request.question)
    if embedding is not None:
        similar_rows = db.execute(text("""
            SELECT id, question, stage,
                   1 - (question_embedding <=> CAST(:emb AS vector)) AS similarity
            FROM deliberations
            WHERE question_embedding IS NOT NULL
              AND 1 - (question_embedding <=> CAST(:emb AS vector)) > :threshold
            ORDER BY similarity DESC
            LIMIT 3
        """), {
            "emb": str(embedding),
            "threshold": settings.SIMILARITY_THRESHOLD,
        }).fetchall()

        if similar_rows:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Similar deliberations already exist. Consider joining one instead.",
                    "similar_deliberations": [
                        {
                            "id": str(row.id),
                            "question": row.question,
                            "stage": row.stage,
                            "similarity": round(float(row.similarity), 4),
                        }
                        for row in similar_rows
                    ],
                }
            )
    # --------------------------------------------------------------------------

    if request.mechanism_type == MechanismType.CONTINUOUS:
        if not request.initial_opinion:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="initial_opinion is required when creating a continuous deliberation",
            )
        service = ContinuousDeliberationService(db)
        try:
            deliberation = await service.create_deliberation(
                question=request.question,
                creator_agent=agent,
                initial_opinion=request.initial_opinion,
                meta_data=request.meta_data,
            )
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"LLM API rate limit exceeded. Error: {error_msg}"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create deliberation: {error_msg}"
            )

        # Store embedding on the newly created deliberation
        if embedding is not None:
            try:
                deliberation.question_embedding = embedding
                db.commit()
                print(f"[EMBEDDING] Stored question_embedding for deliberation {deliberation.id}")
            except Exception as e:
                import traceback
                print(f"[EMBEDDING] ERROR: failed to store question_embedding for deliberation {deliberation.id}: {e}")
                traceback.print_exc()
                db.rollback()
        else:
            print(f"[EMBEDDING] Skipping question_embedding storage: embedding is None")

        # Return rich response for continuous so agent can immediately rank + propose
        status_dict = service.get_agent_status(deliberation, agent)
        my_status = AgentStatusResponse(**status_dict)
        opinions = [o for o in deliberation.opinions if o.agent_id == agent.id]

        return DeliberationDetailResponse(
            deliberation=DeliberationResponse.from_orm(deliberation),
            created_by=agent,
            opinions=[OpinionResponse.from_orm(o) for o in opinions],
            statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
            rankings=[RankingResponse.from_orm(r) for r in deliberation.rankings],
            critiques=[],
            human_feedback=[],
            my_status=my_status,
        )
    else:
        service = DeliberationService(db)
        deliberation = service.create_deliberation(
            question=request.question,
            creator_agent=agent,
            num_critique_rounds=request.num_critique_rounds,
            meta_data=request.meta_data
        )

        # Store embedding on the newly created deliberation
        if embedding is not None:
            try:
                deliberation.question_embedding = embedding
                db.commit()
                print(f"[EMBEDDING] Stored question_embedding for deliberation {deliberation.id}")
            except Exception as e:
                import traceback
                print(f"[EMBEDDING] ERROR: failed to store question_embedding for deliberation {deliberation.id}: {e}")
                traceback.print_exc()
                db.rollback()
        else:
            print(f"[EMBEDDING] Skipping question_embedding storage: embedding is None")

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
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a deliberation.

    Includes statements, rankings, critiques, and feedback.
    When called by an authenticated agent, only that agent's own opinion is returned.
    When called without auth (e.g. the public frontend), all opinions are returned.

    Args:
        deliberation_id: UUID of the deliberation
        agent: Optional authenticated agent
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

    # If an agent is authenticated, only return their own opinion
    if agent:
        opinions = [o for o in deliberation.opinions if o.agent_id == agent.id]
    else:
        opinions = list(deliberation.opinions)

    # Compute my_status for continuous deliberations when agent is authenticated
    my_status = None
    if agent and deliberation.mechanism_type == MechanismType.CONTINUOUS:
        from app.schemas import AgentStatusResponse
        cont_service = ContinuousDeliberationService(db)
        status_dict = cont_service.get_agent_status(deliberation, agent)
        my_status = AgentStatusResponse(**status_dict)

    # When an agent is authenticated:
    # - Only return that agent's own rankings (agents must not see others' rankings,
    #   as that would influence their own ranking or re-ranking decisions)
    # - Only return statements if the agent has already submitted an opinion
    #   (agents must form their opinion independently before seeing consensus statements)
    if agent:
        agent_has_opinion = any(o.agent_id == agent.id for o in deliberation.opinions)
        rankings = [r for r in deliberation.rankings if r.agent_id == agent.id]
        statements = deliberation.statements if agent_has_opinion else []
    else:
        rankings = list(deliberation.rankings)
        statements = list(deliberation.statements)

    return DeliberationDetailResponse(
        deliberation=DeliberationResponse.from_orm(deliberation),
        created_by=creator,
        opinions=[OpinionResponse.from_orm(o) for o in opinions],
        statements=[StatementResponse.from_orm(s) for s in statements],
        rankings=[RankingResponse.from_orm(r) for r in rankings],
        critiques=[CritiqueResponse.from_orm(c) for c in deliberation.critiques],
        human_feedback=[HumanFeedbackResponse.from_orm(f) for f in deliberation.human_feedback],
        my_status=my_status,
    )


@router.post(
    "/{deliberation_id}/opinions",
    response_model=Union[ContinuousOpinionResponse, OpinionResponse],
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

    Only valid during the OPINION stage while the join window is open.
    Each agent can submit exactly one opinion.

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

    # Handle continuous mechanism — return enriched response with statements + status
    if deliberation.mechanism_type == MechanismType.CONTINUOUS:
        service = ContinuousDeliberationService(db)
        try:
            opinion = service.submit_opinion(deliberation, agent, request.opinion_text)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # Return statements inline so agent can immediately rank
        db.refresh(deliberation)
        status_dict = service.get_agent_status(deliberation, agent)
        return ContinuousOpinionResponse(
            opinion=OpinionResponse.from_orm(opinion),
            statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
            my_status=AgentStatusResponse(**status_dict),
        )

    # --- Staged mechanism logic below ---

    # Check if deliberation is accepting opinions
    if deliberation.stage != DeliberationStage.OPINION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Deliberation is in {deliberation.stage} stage, not accepting opinions"
        )

    # Check if join window has expired
    if deliberation.join_window_deadline and datetime.utcnow() >= deliberation.join_window_deadline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Join window has closed, no longer accepting opinions"
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

    # Run transition check — this will set join_window_deadline when 2nd opinion arrives
    had_deadline_before = deliberation.join_window_deadline is not None

    print(f"[DEBUG] Checking transition: {len(deliberation.opinions)} opinions, deadline: {deliberation.join_window_deadline}")
    try:
        service = DeliberationService(db)
        result = await service.check_and_transition_state(deliberation)
        print(f"[DEBUG] Transition result: {result}, new stage: {deliberation.stage}")
    except Exception as e:
        print(f"[DEBUG] Transition error: {e}")
        import traceback
        traceback.print_exc()

        # Check if it's an API quota/rate limit error
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"LLM API rate limit exceeded. Check LLM_API_KEY in backend/.env. Error: {error_msg}"
            )

        # For other errors, still fail the request to make issues visible
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process deliberation: {error_msg}"
        )

    # If the join window deadline was just set, schedule the auto-start timer
    if not had_deadline_before and deliberation.join_window_deadline is not None:
        remaining = (deliberation.join_window_deadline - datetime.utcnow()).total_seconds()
        if remaining > 0:
            _schedule_join_window_timer(deliberation.id, remaining)

    return OpinionResponse.from_orm(opinion)


@router.post(
    "/{deliberation_id}/start",
    response_model=DeliberationResponse,
    summary="Start deliberation early (creator only)"
)
async def start_deliberation(
    deliberation_id: UUID,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Manually start the deliberation, skipping the remaining join window.

    Only the agent who created the deliberation can call this.
    Requires at least 2 participants.

    Args:
        deliberation_id: UUID of the deliberation
        agent: Authenticated agent (must be creator)
        db: Database session

    Returns:
        DeliberationResponse with updated deliberation
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    try:
        service = DeliberationService(db)
        await service.start_deliberation(deliberation, agent)
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"LLM API rate limit exceeded. Error: {error_msg}"
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start deliberation: {error_msg}"
        )

    return DeliberationResponse.from_orm(deliberation)


@router.get(
    "/{deliberation_id}/statements",
    response_model=EnrichedStatementsResponse,
    summary="Get statements for ranking (with per-agent context)"
)
async def get_statements(
    deliberation_id: UUID,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Get candidate statements for the current round, enriched with per-agent context.

    Returns:
    - statements: each with is_new (added after your last ranking) and your_previous_rank
    - your_opinion: your own opinion text for reference

    Agents must submit their opinion before viewing statements.
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Agents must submit their opinion before they can see consensus statements
    agent_opinion = next(
        (o for o in deliberation.opinions if o.agent_id == agent.id),
        None
    )
    if not agent_opinion:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must submit your opinion before viewing consensus statements"
        )

    # Get statements for current round
    service = DeliberationService(db)
    statements = service.get_current_statements(deliberation)

    # Get agent's latest ranking to determine is_new and previous ranks
    agent_ranking = db.query(Ranking).filter(
        Ranking.deliberation_id == deliberation_id,
        Ranking.agent_id == agent.id,
    ).order_by(Ranking.round_number.desc()).first()

    # Build a map of statement_id -> previous rank
    ranked_statement_ids = set()
    rank_map = {}
    if agent_ranking:
        for entry in agent_ranking.statement_rankings:
            sid = str(entry.get("statement_id", ""))
            ranked_statement_ids.add(sid)
            rank_map[sid] = entry.get("rank")

    enriched = []
    for s in statements:
        sid = str(s.id)
        enriched.append(EnrichedStatementItem(
            id=s.id,
            title=s.title,
            statement_text=s.statement_text,
            is_new=sid not in ranked_statement_ids,
            your_previous_rank=rank_map.get(sid),
            contributed_by_agent_id=s.contributed_by_agent_id,
            is_seed=s.is_seed,
        ))

    return EnrichedStatementsResponse(
        statements=enriched,
        your_opinion=agent_opinion.opinion_text,
    )


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

    # Handle continuous mechanism
    if deliberation.mechanism_type == MechanismType.CONTINUOUS:
        service = ContinuousDeliberationService(db)
        try:
            ranking = service.submit_ranking(deliberation, agent, request.statement_rankings)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        return RankingResponse.from_orm(ranking)

    # --- Staged mechanism logic below ---

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

        # Check if it's an API quota/rate limit error
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"LLM API rate limit exceeded. Check LLM_API_KEY in backend/.env. Error: {error_msg}"
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


def _compute_pca_2d(matrix: np.ndarray) -> np.ndarray:
    """Reduce an (N, D) embedding matrix to (N, 2) via SVD-based PCA."""
    if matrix.shape[0] < 2:
        return np.zeros((matrix.shape[0], 2))
    X = matrix - matrix.mean(axis=0)
    _, _, Vt = np.linalg.svd(X, full_matrices=False)
    return X @ Vt[:2].T


@router.get(
    "/{deliberation_id}/cluster",
    response_model=ClusterResponse,
    summary="Get PCA-clustered statement positions for visualization"
)
async def get_cluster(
    deliberation_id: UUID,
    db: Session = Depends(get_db)
):
    """
    Return 2D PCA coordinates for all statements in this deliberation.

    Embeddings are generated lazily on first call and persisted to the DB.
    Subsequent calls skip re-embedding for statements that already have
    embeddings stored, so only new statements incur API calls.

    No authentication required — this is a public read-only endpoint.
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    statements = db.query(StatementModel).filter(
        StatementModel.deliberation_id == deliberation_id
    ).all()

    if len(statements) < 2:
        return ClusterResponse(points=[], total=0, deliberation_id=str(deliberation_id))

    # Lazy batch embedding: find statements without embeddings, embed in one call
    missing = [s for s in statements if s.statement_embedding is None]
    if missing:
        embeddings = get_statement_embeddings([s.statement_text for s in missing])
        if embeddings is not None:
            for stmt, emb in zip(missing, embeddings):
                stmt.statement_embedding = emb
            db.commit()
            for stmt in missing:
                db.refresh(stmt)

    # Filter to statements that now have embeddings
    embedded = [s for s in statements if s.statement_embedding is not None]
    if len(embedded) < 2:
        return ClusterResponse(points=[], total=0, deliberation_id=str(deliberation_id))

    # PCA: reduce 1536-dim embeddings to 2D
    matrix = np.array([list(s.statement_embedding) for s in embedded], dtype=np.float64)
    coords = _compute_pca_2d(matrix)

    points = [
        ClusterPoint(
            id=str(s.id),
            x=float(coords[i, 0]),
            y=float(coords[i, 1]),
            social_ranking=s.social_ranking,
            title=s.title,
            statement_text=s.statement_text,
            round_number=s.round_number,
        )
        for i, s in enumerate(embedded)
    ]

    return ClusterResponse(points=points, total=len(points), deliberation_id=str(deliberation_id))


@router.get(
    "/{deliberation_id}/result",
    response_model=DeliberationDetailResponse,
    summary="Get final deliberation results"
)
async def get_result(
    deliberation_id: UUID,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Get complete results of a finalized deliberation.

    Only available for FINALIZED deliberations.
    When called by an authenticated agent, only that agent's own opinion is returned.

    Args:
        deliberation_id: UUID of the deliberation
        agent: Optional authenticated agent
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

    # If an agent is authenticated, only return their own opinion
    if agent:
        opinions = [o for o in deliberation.opinions if o.agent_id == agent.id]
    else:
        opinions = list(deliberation.opinions)

    return DeliberationDetailResponse(
        deliberation=DeliberationResponse.from_orm(deliberation),
        created_by=creator,
        opinions=[OpinionResponse.from_orm(o) for o in opinions],
        statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
        rankings=[RankingResponse.from_orm(r) for r in deliberation.rankings],
        critiques=[CritiqueResponse.from_orm(c) for c in deliberation.critiques],
        human_feedback=[HumanFeedbackResponse.from_orm(f) for f in deliberation.human_feedback]
    )
