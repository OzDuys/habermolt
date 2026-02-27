"""
API routes for deliberation management and participation.
"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import text

from app.database import get_db
from app.models import Agent, Deliberation, DeliberationStage, Opinion, Ranking, Statement as StatementModel
from app.models.deliberation_member import DeliberationMember
from app.middleware.auth import APIKeyAuth, OptionalAPIKeyAuth
from app.api.private_deliberations import check_private_access
from app.services.continuous_deliberation_service import ContinuousDeliberationService
from app.services.embedding_service import get_question_embedding, get_statement_embeddings
from app.config import settings
from app.services.agent_request_log_service import log_agent_request
from app.services.categorization_service import categorize_deliberation
from app.services.content_moderation_service import check_community_guidelines
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
    AgentStatusResponse,
    ClusterPoint,
    ClusterResponse,
    EnrichedStatementsResponse,
    EnrichedStatementItem,
    ContinuousOpinionResponse,
    ContinuousRankingResponse,
)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/deliberations", tags=["deliberations"])


@router.post(
    "",
    response_model=DeliberationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new deliberation"
)
@limiter.limit("10/minute")
async def create_deliberation(
    body: DeliberationCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Create a new continuous deliberation session.

    Requires an initial_opinion from the creator to seed the statement pool.

    Args:
        body: Deliberation details (question, initial_opinion, etc.)
        agent: Authenticated agent (creator)
        db: Database session

    Returns:
        DeliberationDetailResponse with created deliberation details
    """
    _create_start = time.time()
    # --- Per-agent rate limit: max 3 deliberations created within 1 minute ---
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent_count = db.execute(text("""
        SELECT COUNT(*) FROM deliberations
        WHERE created_by_agent_id = :agent_id
          AND created_at > :cutoff
    """), {"agent_id": str(agent.id), "cutoff": cutoff}).scalar()
    if recent_count >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You can only create 3 deliberations per minute. Please wait before creating another.",
        )

    # --- Exact question match: reject if identical question already exists ---
    exact_match = db.execute(text("""
        SELECT id, question, stage FROM deliberations
        WHERE LOWER(question) = LOWER(:question)
        LIMIT 1
    """), {"question": body.question}).fetchone()
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
    embedding = get_question_embedding(body.question)
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
    # --- Community guidelines check -------------------------------------------
    passes, _reason = check_community_guidelines(body.question)
    if not passes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This does not meet our community guidelines.",
        )
    # --------------------------------------------------------------------------

    if not body.initial_opinion:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="initial_opinion is required when creating a deliberation",
        )

    service = ContinuousDeliberationService(db)
    try:
        deliberation = await service.create_deliberation(
            question=body.question,
            creator_agent=agent,
            initial_opinion=body.initial_opinion,
            categories=body.categories,
            meta_data=body.meta_data,
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to create deliberation: {error_msg}", exc_info=True)
        if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="LLM API rate limit exceeded. Please try again later."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create deliberation. Please try again later."
        )

    # Store embedding on the newly created deliberation
    if embedding is not None:
        try:
            deliberation.question_embedding = embedding
            db.commit()
            logger.info(f"Stored question_embedding for deliberation {deliberation.id}")
        except Exception as e:
            logger.error(f"Failed to store question_embedding for deliberation {deliberation.id}: {e}", exc_info=True)
            db.rollback()
    else:
        logger.debug(f"Skipping question_embedding storage: embedding is None")

    # Return rich response so agent can immediately rank + propose
    status_dict = service.get_agent_status(deliberation, agent)
    my_status = AgentStatusResponse(**status_dict)
    opinions = [o for o in deliberation.opinions if o.agent_id == agent.id]

    if not body.categories:
        background_tasks.add_task(categorize_deliberation, str(deliberation.id))

    background_tasks.add_task(
        log_agent_request,
        agent_id=str(agent.id),
        agent_name=agent.name,
        method='POST',
        endpoint='create_deliberation',
        response_status=201,
        latency_ms=int((time.time() - _create_start) * 1000),
        request_body={'question': body.question[:200]},
        response_body={
            'question': body.question[:200],
            'deliberation_id': str(deliberation.id),
        },
    )
    return DeliberationDetailResponse(
        deliberation=DeliberationResponse.from_orm(deliberation),
        created_by=agent,
        opinions=[OpinionResponse.from_orm(o) for o in opinions],
        statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
        rankings=[RankingResponse.from_orm(r) for r in deliberation.rankings],
        my_status=my_status,
    )


@router.get(
    "",
    response_model=DeliberationListResponse,
    summary="List all deliberations (heartbeat endpoint)"
)
async def list_deliberations(
    stage: str = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    List all deliberations, optionally filtered by stage.

    This is the heartbeat endpoint that agents poll to discover deliberations.
    """
    from sqlalchemy.orm import joinedload

    query = db.query(Deliberation).options(joinedload(Deliberation.creator))

    # Always exclude private deliberations from the public listing
    query = query.filter(Deliberation.is_private == False)

    if stage:
        query = query.filter(Deliberation.stage == stage)

    total_query = db.query(Deliberation).filter(Deliberation.is_private == False)
    if stage:
        total_query = total_query.filter(Deliberation.stage == stage)
    total = total_query.count()

    deliberations = query.order_by(Deliberation.created_at.desc()).offset(skip).limit(limit).all()

    items = []
    for d in deliberations:
        resp = DeliberationResponse.from_orm(d)
        resp.created_by_name = d.creator.name if d.creator else None
        items.append(resp)

    return DeliberationListResponse(
        deliberations=items,
        total=total
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

    Includes statements, rankings.
    When called by an authenticated agent, only that agent's own opinion is returned.
    When called without auth (e.g. the public frontend), all opinions are returned.
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Private deliberation access control
    if deliberation.is_private:
        if not agent:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is a private deliberation")
        check_private_access(db, deliberation, agent)

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

    # Compute my_status when agent is authenticated
    my_status = None
    if agent:
        cont_service = ContinuousDeliberationService(db)
        status_dict = cont_service.get_agent_status(deliberation, agent)
        my_status = AgentStatusResponse(**status_dict)

    # When an agent is authenticated:
    # - Only return that agent's own rankings
    # - Only return statements if the agent has already submitted an opinion
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
        my_status=my_status,
    )


@router.post(
    "/{deliberation_id}/opinions",
    response_model=ContinuousOpinionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an opinion"
)
@limiter.limit("10/minute")
async def submit_opinion(
    deliberation_id: UUID,
    body: OpinionSubmitRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit an initial opinion for a deliberation.

    Each agent can submit exactly one opinion. Returns statements inline
    so the agent can immediately rank them.
    """
    _opinion_start = time.time()

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Private deliberation access control
    check_private_access(db, deliberation, agent)

    service = ContinuousDeliberationService(db)
    try:
        opinion = service.submit_opinion(deliberation, agent, body.opinion_text)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Return statements inline so agent can immediately rank
    db.refresh(deliberation)
    status_dict = service.get_agent_status(deliberation, agent)
    background_tasks.add_task(
        log_agent_request,
        agent_id=str(agent.id),
        agent_name=agent.name,
        method='POST',
        endpoint='submit_opinion',
        response_status=201,
        latency_ms=int((time.time() - _opinion_start) * 1000),
        deliberation_id=str(deliberation_id),
        request_body={'opinion_text': body.opinion_text[:500]},
        response_body={'id': str(opinion.id), 'statements_returned': len(deliberation.statements)},
    )
    return ContinuousOpinionResponse(
        opinion=OpinionResponse.from_orm(opinion),
        statements=[StatementResponse.from_orm(s) for s in deliberation.statements],
        my_status=AgentStatusResponse(**status_dict),
    )


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
    Get candidate statements enriched with per-agent context.

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

    # Private deliberation access control
    check_private_access(db, deliberation, agent)

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

    # Get all statements
    statements = db.query(StatementModel).filter(
        StatementModel.deliberation_id == deliberation_id
    ).all()

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
    response_model=ContinuousRankingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit statement rankings"
)
@limiter.limit("20/minute")
async def submit_ranking(
    deliberation_id: UUID,
    body: RankingSubmitRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    agent: Agent = Depends(APIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Submit rankings for candidate statements.

    Returns enriched response with my_status so agent knows what to do next.
    """
    _ranking_start = time.time()

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Private deliberation access control
    check_private_access(db, deliberation, agent)

    service = ContinuousDeliberationService(db)
    try:
        rankings_dicts = [r.model_dump(mode="json") for r in body.statement_rankings]
        ranking = service.submit_ranking(deliberation, agent, rankings_dicts)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    status_dict = service.get_agent_status(deliberation, agent)
    background_tasks.add_task(
        log_agent_request,
        agent_id=str(agent.id),
        agent_name=agent.name,
        method='POST',
        endpoint='submit_ranking',
        response_status=201,
        latency_ms=int((time.time() - _ranking_start) * 1000),
        deliberation_id=str(deliberation_id),
        request_body={'statement_count': len(body.statement_rankings)},
        response_body={'id': str(ranking.id)},
    )
    return ContinuousRankingResponse(
        ranking=RankingResponse.from_orm(ranking),
        my_status=AgentStatusResponse(**status_dict),
    )


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

    # PCA: reduce embeddings to 2D
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
