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
from app.services.id_resolution import resolve_deliberation_id


def _latest_opinions(opinions: list) -> list:
    """Given a list of Opinion objects, return only the latest version per agent."""
    best = {}
    for o in opinions:
        key = o.agent_id
        if key not in best or o.version > best[key].version:
            best[key] = o
    return list(best.values())
from app.models.deliberation_member import DeliberationMember
from app.middleware.auth import APIKeyAuth, OptionalAPIKeyAuth
from app.services.access_control import check_private_access, enforce_deliberation_access
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
    OpinionClusterPoint,
    OpinionClusterInfo,
    OpinionSubClusterInfo,
    OpinionClusterResponse,
    EnrichedStatementsResponse,
    EnrichedStatementItem,
    ContinuousOpinionResponse,
    ContinuousRankingResponse,
)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)


def _embed_opinion(opinion_id: str, opinion_text: str):
    """Background task: embed a single opinion and persist to DB."""
    from app.database import SessionLocal
    try:
        embeddings = get_statement_embeddings([opinion_text])
        if embeddings is not None and len(embeddings) == 1:
            db = SessionLocal()
            try:
                op = db.query(Opinion).filter(Opinion.id == opinion_id).first()
                if op and op.opinion_embedding is None:
                    op.opinion_embedding = embeddings[0]
                    db.commit()
                    logger.info(f"Embedded opinion {opinion_id}")

                    # Recompute opinion dynamics now that we have the embedding
                    from app.services.analysis_service import update_deliberation_dynamics
                    deliberation = db.query(Deliberation).filter(
                        Deliberation.id == op.deliberation_id
                    ).first()
                    if deliberation:
                        update_deliberation_dynamics(
                            deliberation, db,
                            update_statements=False, update_opinions=True
                        )
                        db.commit()
            finally:
                db.close()
    except Exception as e:
        logger.warning(f"Failed to embed opinion {opinion_id}: {e}")

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
    passes, _reason = check_community_guidelines(body.question, db=db, source="agent")
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

    # Resolve prompt config from preset or explicit config
    prompt_config = body.prompt_config
    if not prompt_config and body.prompt_preset:
        prompt_config = {"preset": body.prompt_preset}

    service = ContinuousDeliberationService(db)
    try:
        deliberation = await service.create_deliberation(
            question=body.question,
            creator_agent=agent,
            initial_opinion=body.initial_opinion,
            categories=body.categories,
            meta_data=body.meta_data,
            description=body.description,
            prompt_config=prompt_config,
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
    opinions = _latest_opinions([o for o in deliberation.opinions if o.agent_id == agent.id])

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
        statements=[StatementResponse.from_orm(s) for s in deliberation.active_statements],
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
    limit: int = Query(48, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    List all deliberations, optionally filtered by stage.

    This is the heartbeat endpoint that agents poll to discover deliberations.
    """
    from sqlalchemy.orm import joinedload
    from sqlalchemy import func

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

    # Batch-fetch activity counts for all deliberations in one query each
    delib_ids = [d.id for d in deliberations]

    opinion_counts = {}
    statement_counts = {}
    ranking_counts = {}

    if delib_ids:
        for row in db.query(Opinion.deliberation_id, func.count()).filter(
            Opinion.deliberation_id.in_(delib_ids)
        ).group_by(Opinion.deliberation_id).all():
            opinion_counts[row[0]] = row[1]

        for row in db.query(StatementModel.deliberation_id, func.count()).filter(
            StatementModel.deliberation_id.in_(delib_ids),
            StatementModel.is_seed == False,
        ).group_by(StatementModel.deliberation_id).all():
            statement_counts[row[0]] = row[1]

        for row in db.query(Ranking.deliberation_id, func.count()).filter(
            Ranking.deliberation_id.in_(delib_ids)
        ).group_by(Ranking.deliberation_id).all():
            ranking_counts[row[0]] = row[1]

    items = []
    for d in deliberations:
        resp = DeliberationResponse.from_orm(d)
        resp.created_by_name = d.creator.name if d.creator else None
        resp.num_opinions = opinion_counts.get(d.id, 0)
        resp.num_agent_statements = statement_counts.get(d.id, 0)
        resp.num_rankings = ranking_counts.get(d.id, 0)
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
    deliberation_id: str,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a deliberation.

    Includes statements, rankings.
    When called by an authenticated agent, only that agent's own opinion is returned.
    When called without auth (e.g. the public frontend), all opinions are returned.
    """
    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

    # Fetch the creator agent
    creator = db.query(Agent).filter(Agent.id == deliberation.created_by_agent_id).first()
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Creator agent not found"
        )

    # If an agent is authenticated, only return their own latest opinion
    if agent:
        opinions = _latest_opinions([o for o in deliberation.opinions if o.agent_id == agent.id])
    else:
        opinions = _latest_opinions(deliberation.opinions)

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
        statements = deliberation.active_statements if agent_has_opinion else []
    else:
        rankings = list(deliberation.rankings)
        statements = list(deliberation.active_statements)

    delib_resp = DeliberationResponse.from_orm(deliberation)
    if deliberation.community_id and deliberation.community:
        delib_resp.community_name = deliberation.community.name

    return DeliberationDetailResponse(
        deliberation=delib_resp,
        created_by=creator,
        opinions=[OpinionResponse.from_orm(o) for o in opinions],
        statements=[StatementResponse.from_orm(s) for s in statements],
        rankings=[RankingResponse.from_orm(r) for r in rankings],
        my_status=my_status,
    )


@router.get(
    "/{deliberation_id}/evicted-statements",
    summary="Get evicted statements for a deliberation"
)
async def get_evicted_statements(
    deliberation_id: str,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db)
):
    """Return statements that have been evicted from the active pool."""
    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

    evicted = [s for s in deliberation.statements if s.is_evicted]
    return {
        "statements": [StatementResponse.from_orm(s) for s in evicted],
        "total_evicted": len(evicted),
        "total_all_time": len(deliberation.statements),
        "active_count": len(deliberation.active_statements),
    }


@router.post(
    "/{deliberation_id}/opinions",
    response_model=ContinuousOpinionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an opinion"
)
@limiter.limit("10/minute")
async def submit_opinion(
    deliberation_id: str,
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

    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

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
        opinion = service.submit_opinion(deliberation, agent, body.opinion_text, source="api")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Return statements inline so agent can immediately rank
    db.refresh(deliberation)
    status_dict = service.get_agent_status(deliberation, agent)
    # Embed the opinion in the background so it's ready for clustering
    background_tasks.add_task(_embed_opinion, str(opinion.id), body.opinion_text)
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
        response_body={'id': str(opinion.id), 'statements_returned': len(deliberation.active_statements)},
    )
    return ContinuousOpinionResponse(
        opinion=OpinionResponse.from_orm(opinion),
        statements=[StatementResponse.from_orm(s) for s in deliberation.active_statements],
        my_status=AgentStatusResponse(**status_dict),
    )


@router.get(
    "/{deliberation_id}/statements",
    response_model=EnrichedStatementsResponse,
    summary="Get statements for ranking (with per-agent context)"
)
async def get_statements(
    deliberation_id: str,
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
    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

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
    ).first()

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
    deliberation_id: str,
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

    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

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
        from app.services.id_resolution import resolve_statement_ids
        id_map = resolve_statement_ids(
            db, deliberation_id,
            [r.statement_id for r in body.statement_rankings],
        )
        rankings_dicts = [
            {"statement_id": id_map[r.statement_id], "rank": r.rank}
            for r in body.statement_rankings
        ]
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
    deliberation_id: str,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db)
):
    """
    Return 2D PCA coordinates for all statements in this deliberation.

    Embeddings are generated lazily on first call and persisted to the DB.
    """
    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

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
            is_evicted=s.is_evicted,
        )
        for i, s in enumerate(embedded)
    ]

    return ClusterResponse(points=points, total=len(points), deliberation_id=str(deliberation_id))


# ─── Hierarchical opinion clustering ─────────────────────────────────────────
# Base hues for top-level clusters — each gets shades for sub-clusters.
# Format: (H, S%, L%) base values — sub-clusters vary lightness.
CLUSTER_BASE_HUES = [
    (210, 60, 45),   # blue
    (35, 80, 48),    # amber
    (300, 50, 42),   # purple
    (180, 70, 35),   # teal
    (260, 55, 48),   # indigo
    (14, 75, 45),    # warm red-orange
    (150, 65, 35),   # green
    (340, 60, 45),   # pink
]

CLUSTER_CACHE_TTL_SECONDS = 300  # 5 minutes

# Semantic label -> forced hue override (H, S%, L%)
LABEL_HUE_OVERRIDES: dict[str, tuple[int, int, int]] = {
    "yes": (140, 65, 38),   # green
    "no": (0, 70, 45),      # red
}


def _hsl_to_hex(h: int, s: int, l: int) -> str:
    """Convert HSL values to hex color string."""
    import colorsys
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def _generate_cluster_colors(
    num_top: int, sub_counts: list[int], labels: list[str],
) -> tuple[list[str], list[list[str]]]:
    """Generate colors for top-level clusters and their sub-clusters.
    Labels like "Yes"/"No" get forced green/red hues.
    Returns (top_colors, sub_colors) where sub_colors[i] is a list of colors for cluster i's sub-clusters."""
    top_colors = []
    sub_colors = []
    # Track which default hues have been used so overrides don't cause duplicates
    next_default = 0
    for i in range(num_top):
        label_lower = labels[i].strip().lower() if i < len(labels) else ""
        if label_lower in LABEL_HUE_OVERRIDES:
            h, s, l = LABEL_HUE_OVERRIDES[label_lower]
        else:
            h, s, l = CLUSTER_BASE_HUES[next_default % len(CLUSTER_BASE_HUES)]
            next_default += 1

        top_colors.append(_hsl_to_hex(h, s, l))
        n_sub = sub_counts[i] if i < len(sub_counts) else 0
        if n_sub <= 1:
            sub_colors.append([_hsl_to_hex(h, s, l)])
        else:
            # Spread lightness from darker to lighter within the hue
            shades = []
            for j in range(n_sub):
                shade_l = max(25, min(52, l - 10 + (j * 25 // max(n_sub - 1, 1))))
                shades.append(_hsl_to_hex(h, s, shade_l))
            sub_colors.append(shades)
    return top_colors, sub_colors


def _find_optimal_k(matrix: np.ndarray, max_k: int = 8, min_k: int = 3) -> int:
    """Find the optimal number of clusters using silhouette score.
    min_k=3 ensures the LLM has enough clusters to group into distinct positions."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    n = matrix.shape[0]
    if n < 3:
        return 1
    max_k = min(max_k, n - 1)
    min_k = min(min_k, max_k)
    if max_k < 2:
        return 1

    best_k = min_k
    best_score = -1.0
    for k in range(min_k, max_k + 1):
        km = KMeans(n_clusters=k, n_init=3, random_state=42)
        labels = km.fit_predict(matrix)
        score = silhouette_score(matrix, labels)
        if score > best_score:
            best_score = score
            best_k = k
    return best_k


LLM_DIRECT_ASSIGN_THRESHOLD = 50  # Below this, LLM assigns opinions directly


def _llm_direct_cluster(
    question: str,
    opinions: list[tuple[int, str]],  # (index, opinion_text)
    db: Session,
) -> dict:
    """LLM directly assigns each opinion to a top-level group.

    Used when opinion count is small enough. More accurate than k-means
    because the LLM understands the question and groups by position, not
    writing style.

    Returns same format as _generate_hierarchical_labels:
    {"groups": [{"label": "...", "opinion_indices": [0, 2, 5], ...}, ...]}
    """
    from app.services.llm_client import LLMClient

    opinion_list = "\n".join(
        f"{idx}. {text[:300]}" for idx, text in opinions
    )

    prompt = (
        f'Question being deliberated: "{question}"\n\n'
        f"Below are {len(opinions)} opinions. Assign EACH opinion to a top-level position "
        f"(2-5 groups based on WHAT they believe).\n\n"
        f"{opinion_list}\n\n"
        "RULES:\n"
        "- Top-level labels must be 1-3 words (e.g. \"Yes\", \"No\", \"OpenAI\", \"Google\", \"Mixed\")\n"
        "- For yes/no questions, use \"Yes\", \"No\", and optionally \"Mixed\"\n"
        "- For \"who/which\" questions, use the entity names\n"
        "- NEVER use abstract phrases like \"structural advantages\" or \"democratic agency\"\n"
        "- Labels should be what you'd put on a pie chart\n"
        "- Group by WHAT they believe, not HOW they express it\n"
        "- Every opinion number must appear in exactly one group\n\n"
        "Return ONLY JSON:\n"
        '{"groups": [\n'
        '  {"label": "Yes", "opinion_indices": [0, 2, 5]},\n'
        '  {"label": "No", "opinion_indices": [1, 3, 4]}\n'
        "]}\n"
        "No other text."
    )

    try:
        client = LLMClient()
        client.set_trace_context(trace_type="opinion_cluster_direct")
        raw = client.sample_text(prompt, temperature=0.3, max_tokens=1024)
        import json
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
            if "groups" in result:
                return result
    except Exception as e:
        logger.warning(f"Failed LLM direct clustering: {e}")

    # Fallback: single group
    return {"groups": [{"label": "All", "opinion_indices": [idx for idx, _ in opinions]}]}


def _generate_hierarchical_labels(
    question: str,
    kmeans_clusters: dict[int, list[str]],
    db: Session,
) -> dict:
    """Use LLM to group k-means clusters into top-level positions with sub-labels.

    Returns: {
        "groups": [
            {"label": "Yes", "kmeans_ids": [0, 2, 4], "sub_labels": {"0": "Safety concerns", "2": "Job loss", "4": "Ethics"}},
            {"label": "No", "kmeans_ids": [1, 3], "sub_labels": {"1": "Innovation", "3": "Economy"}},
        ]
    }
    """
    from app.services.llm_client import LLMClient

    cluster_summaries = []
    for cid in sorted(kmeans_clusters.keys()):
        opinions = kmeans_clusters[cid]
        joined = "\n- ".join(opinions[:4])
        cluster_summaries.append(f"Group {cid} ({len(opinions)} opinions):\n- {joined}")

    prompt = (
        f'Question being deliberated: "{question}"\n\n'
        f"Below are {len(kmeans_clusters)} opinion groups from a deliberation. "
        f"Your job is to merge them into 2-5 TOP-LEVEL positions based on what they believe, "
        f"then label each sub-group.\n\n"
        + "\n\n".join(cluster_summaries)
        + "\n\n"
        "RULES:\n"
        "- Top-level labels must be 1-3 words (e.g. \"Yes\", \"No\", \"OpenAI\", \"Google\", \"Mixed\")\n"
        "- For yes/no questions, use \"Yes\", \"No\", and optionally \"Mixed\"\n"
        "- For \"who/which\" questions, use the entity names\n"
        "- NEVER use abstract phrases like \"structural advantages\" or \"democratic agency\"\n"
        "- Labels should be what you'd put on a pie chart\n"
        "- Sub-labels should be 2-4 words explaining WHY within that position\n"
        "- If a top-level group only has one sub-group, still include it\n"
        "- Every group number must appear in exactly one top-level position\n"
        "- NEVER put the same group number in multiple positions\n\n"
        "Return ONLY JSON in this exact format:\n"
        '{"groups": [\n'
        '  {"label": "Yes", "kmeans_ids": [0, 2], "sub_labels": {"0": "Safety risks", "2": "Job concerns"}},\n'
        '  {"label": "No", "kmeans_ids": [1, 3], "sub_labels": {"1": "Pro innovation", "3": "Economic growth"}}\n'
        "]}\n"
        "No other text."
    )

    try:
        client = LLMClient()
        client.set_trace_context(trace_type="opinion_cluster_labels")
        raw = client.sample_text(prompt, temperature=0.3, max_tokens=512)
        import json
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
            if "groups" in result:
                return result
    except Exception as e:
        logger.warning(f"Failed to generate hierarchical cluster labels: {e}")

    # Fallback: each k-means cluster is its own top-level group, no sub-clusters
    return {
        "groups": [
            {
                "label": f"Group {cid + 1}",
                "kmeans_ids": [cid],
                "sub_labels": {str(cid): f"Group {cid + 1}"},
            }
            for cid in sorted(kmeans_clusters.keys())
        ]
    }


def _generate_sub_cluster_labels(
    question: str,
    valid_groups: list[dict],
    sub_cluster_opinions: dict[tuple[int, int], list[str]],
    top_to_kmeans: dict[int, list[int]],
    db: Session,
) -> dict[tuple[int, int], str]:
    """Use LLM to generate short labels for sub-clusters within each top-level group.
    Returns {(top_id, sub_id): "label", ...}"""
    from app.services.llm_client import LLMClient

    # Only generate labels if there are sub-clusters to label
    groups_with_subs = []
    for top_id, group in enumerate(valid_groups):
        kmeans_ids = sorted(top_to_kmeans.get(top_id, []))
        if len(kmeans_ids) <= 1:
            continue
        subs = []
        for sub_id in range(len(kmeans_ids)):
            opinions = sub_cluster_opinions.get((top_id, sub_id), [])
            if opinions:
                subs.append((sub_id, opinions))
        if subs:
            groups_with_subs.append((top_id, group.get("label", "Group"), subs))

    if not groups_with_subs:
        return {}

    # Build prompt
    sections = []
    for top_id, top_label, subs in groups_with_subs:
        sub_parts = []
        for sub_id, opinions in subs:
            sample = "\n  - ".join(o[:200] for o in opinions[:3])
            sub_parts.append(f"  Sub {top_id}-{sub_id} ({len(opinions)} opinions):\n  - {sample}")
        sections.append(f'"{top_label}" sub-clusters:\n' + "\n".join(sub_parts))

    prompt = (
        f'Question: "{question}"\n\n'
        f"Below are sub-clusters within each top-level opinion group. "
        f"Generate a SHORT label (2-4 words) for each sub-cluster that captures "
        f"the specific reasoning or angle within that position.\n\n"
        + "\n\n".join(sections)
        + "\n\n"
        "RULES:\n"
        "- Labels should explain WHY or HOW, not repeat the top-level position\n"
        "- 2-4 words max per label\n"
        "- Be specific, not abstract\n\n"
        'Return ONLY JSON: {"labels": {"0-0": "Safety concerns", "0-1": "Job displacement", "1-0": "Innovation freedom"}}\n'
        "Keys are top_id-sub_id. No other text."
    )

    try:
        client = LLMClient()
        client.set_trace_context(trace_type="opinion_sub_cluster_labels")
        raw = client.sample_text(prompt, temperature=0.3, max_tokens=512)
        import json
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            result = json.loads(raw[start:end])
            labels = result.get("labels", result)
            return {
                (int(k.split("-")[0]), int(k.split("-")[1])): str(v)
                for k, v in labels.items()
                if "-" in str(k)
            }
    except Exception as e:
        logger.warning(f"Failed to generate sub-cluster labels: {e}")

    return {}


def _opinion_set_hash(opinions: list) -> str:
    """Stable hash of opinion IDs + versions to detect changes."""
    import hashlib
    parts = sorted(f"{o.id}:{o.version}" for o in opinions)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def _compute_opinion_clusters(
    deliberation,
    latest_opinions: list,
    db: Session,
) -> dict:
    """Compute hierarchical opinion clusters.

    Two paths:
    - Small (≤50 opinions): LLM directly assigns each opinion to a position,
      then k-means finds sub-clusters within each group.
    - Large (>50 opinions): k-means first, then LLM groups k-means clusters.
    """
    # Lazy embedding for any opinions missing embeddings
    missing = [o for o in latest_opinions if o.opinion_embedding is None]
    if missing:
        embeddings = get_statement_embeddings([o.opinion_text for o in missing])
        if embeddings is not None:
            for op, emb in zip(missing, embeddings):
                op.opinion_embedding = emb
            db.commit()
            for op in missing:
                db.refresh(op)

    embedded = [o for o in latest_opinions if o.opinion_embedding is not None]
    if len(embedded) < 2:
        return {"points": [], "clusters": [], "total": 0, "deliberation_id": str(deliberation.id)}

    # PCA to 2D
    matrix = np.array([list(o.opinion_embedding) for o in embedded], dtype=np.float64)
    coords = _compute_pca_2d(matrix)

    # Build agent name map
    agent_ids = [o.agent_id for o in embedded]
    agents_db = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
    agent_name_map = {a.id: a.name for a in agents_db}

    total = len(embedded)

    if total <= LLM_DIRECT_ASSIGN_THRESHOLD:
        return _compute_clusters_direct(
            deliberation, embedded, matrix, coords, agent_name_map, total, db,
        )
    else:
        return _compute_clusters_kmeans(
            deliberation, embedded, matrix, coords, agent_name_map, total, db,
        )


def _compute_clusters_direct(
    deliberation, embedded, matrix, coords, agent_name_map, total, db,
) -> dict:
    """LLM assigns each opinion to a top-level group (accurate by position).
    K-means runs on the full space and its clusters become sub-clusters,
    mapped to whichever top-level group holds the majority of their opinions.

    This gives you both:
    - LLM accuracy for top-level grouping (Employees vs Companies)
    - K-means embedding structure for sub-clusters (reasoning similarity)
    """
    from sklearn.cluster import KMeans
    from collections import Counter

    # 1. K-means on full embedding space
    optimal_k = _find_optimal_k(matrix)
    km = KMeans(n_clusters=optimal_k, n_init=3, random_state=42)
    kmeans_labels = km.fit_predict(matrix)

    # 2. LLM assigns each opinion to a top-level group
    opinions_for_llm = [(i, o.opinion_text) for i, o in enumerate(embedded)]
    hierarchy = _llm_direct_cluster(deliberation.question, opinions_for_llm, db)

    # Parse LLM response — build opinion_index -> top_group_id mapping
    groups = hierarchy.get("groups", [])
    all_indices = set(range(total))
    llm_assignment: dict[int, int] = {}  # opinion_index -> top_group_id
    seen: set[int] = set()
    valid_groups: list[dict] = []
    for group in groups:
        raw_indices = group.get("opinion_indices", [])
        deduped = [idx for idx in raw_indices if idx in all_indices and idx not in seen]
        seen.update(deduped)
        if deduped:
            gid = len(valid_groups)
            for idx in deduped:
                llm_assignment[idx] = gid
            valid_groups.append({**group, "_indices": deduped})

    # Assign unassigned opinions to the largest group
    unassigned = all_indices - seen
    if unassigned and valid_groups:
        largest = max(range(len(valid_groups)), key=lambda i: len(valid_groups[i]["_indices"]))
        for idx in unassigned:
            llm_assignment[idx] = largest
        valid_groups[largest]["_indices"].extend(unassigned)

    # 3. Map each k-means cluster to the top-level group that holds the majority
    #    of its opinions — k-means clusters become sub-clusters
    kmeans_to_top: dict[int, int] = {}  # kmeans_cluster_id -> top_group_id
    kmeans_indices: dict[int, list[int]] = {}
    for i in range(total):
        kid = int(kmeans_labels[i])
        kmeans_indices.setdefault(kid, []).append(i)

    for kid, indices in kmeans_indices.items():
        # Majority vote: which top-level group do most opinions in this k-means cluster belong to?
        votes = Counter(llm_assignment.get(idx, 0) for idx in indices)
        kmeans_to_top[kid] = votes.most_common(1)[0][0]

    # Build top_group -> list of kmeans_cluster_ids
    top_to_kmeans: dict[int, list[int]] = {}
    for kid, gid in kmeans_to_top.items():
        top_to_kmeans.setdefault(gid, []).append(kid)

    # 4. Assign every opinion to a sub-cluster (no orphans)
    #    Each opinion goes to its k-means cluster's sub_id within its LLM top group.
    #    If a k-means cluster was majority-mapped to a different top group,
    #    the minority opinions get folded into the nearest sub-cluster in their own top group.
    opinion_mapping: dict[int, tuple[int, int]] = {}

    # First pass: map opinions whose k-means cluster belongs to their top group
    for i in range(total):
        kid = int(kmeans_labels[i])
        top_id = llm_assignment.get(i, 0)
        kmeans_ids_in_group = sorted(top_to_kmeans.get(top_id, []))
        if kid in kmeans_ids_in_group:
            sub_id = kmeans_ids_in_group.index(kid)
            opinion_mapping[i] = (top_id, sub_id)

    # Second pass: orphaned opinions (k-means cluster mapped elsewhere) go to sub_id 0
    for i in range(total):
        if i not in opinion_mapping:
            top_id = llm_assignment.get(i, 0)
            opinion_mapping[i] = (top_id, 0)

    # Build sub-cluster counts (now includes orphans folded into sub 0)
    sub_counts_map: dict[tuple[int, int], int] = {}
    for top_id, sub_id in opinion_mapping.values():
        sub_counts_map[(top_id, sub_id)] = sub_counts_map.get((top_id, sub_id), 0) + 1

    sub_counts = [len(top_to_kmeans.get(gid, [])) for gid in range(len(valid_groups))]
    top_labels = [g.get("label", "Group") for g in valid_groups]
    top_colors, sub_color_lists = _generate_cluster_colors(len(valid_groups), sub_counts, top_labels)

    # Collect sub-cluster opinion texts for LLM labeling
    sub_cluster_opinions: dict[tuple[int, int], list[str]] = {}
    for i, o in enumerate(embedded):
        key = opinion_mapping[i]
        sub_cluster_opinions.setdefault(key, []).append(o.opinion_text)

    # Generate sub-cluster labels via LLM
    sub_cluster_labels = _generate_sub_cluster_labels(
        deliberation.question, valid_groups, sub_cluster_opinions, top_to_kmeans, db,
    )

    clusters_info = []
    for top_id, group in enumerate(valid_groups):
        top_label = group.get("label", f"Group {top_id + 1}")
        top_count = len(group["_indices"])

        kmeans_ids_in_group = sorted(top_to_kmeans.get(top_id, []))

        sub_clusters_info = []
        if len(kmeans_ids_in_group) > 1:
            for sub_id in range(len(kmeans_ids_in_group)):
                count = sub_counts_map.get((top_id, sub_id), 0)
                if count == 0:
                    continue
                sub_color = sub_color_lists[top_id][sub_id] if sub_id < len(sub_color_lists[top_id]) else top_colors[top_id]
                sub_label = sub_cluster_labels.get((top_id, sub_id), f"Subgroup {sub_id + 1}")
                sub_clusters_info.append({
                    "sub_cluster_id": sub_id,
                    "label": sub_label,
                    "color": sub_color,
                    "count": count,
                    "percentage": round(count / total * 100, 1),
                })

        clusters_info.append({
            "cluster_id": top_id,
            "label": top_label,
            "color": top_colors[top_id],
            "count": top_count,
            "percentage": round(top_count / total * 100, 1),
            "sub_clusters": sub_clusters_info,
        })

    points = [
        {
            "id": str(o.id),
            "agent_id": str(o.agent_id),
            "agent_name": agent_name_map.get(o.agent_id, "Agent"),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
            "cluster": opinion_mapping.get(i, (0, 0))[0],
            "sub_cluster": opinion_mapping.get(i, (0, 0))[1],
            "opinion_text": o.opinion_text,
        }
        for i, o in enumerate(embedded)
    ]

    return {
        "points": points,
        "clusters": clusters_info,
        "total": total,
        "deliberation_id": str(deliberation.id),
    }


def _compute_clusters_kmeans(
    deliberation, embedded, matrix, coords, agent_name_map, total, db,
) -> dict:
    """K-means first (for scale), then LLM groups k-means clusters into positions."""
    from sklearn.cluster import KMeans

    optimal_k = _find_optimal_k(matrix)
    km = KMeans(n_clusters=optimal_k, n_init=3, random_state=42)
    kmeans_labels = km.fit_predict(matrix)

    # Build k-means cluster -> opinion texts map
    kmeans_opinions: dict[int, list[str]] = {}
    kmeans_indices: dict[int, list[int]] = {}
    for i, o in enumerate(embedded):
        cid = int(kmeans_labels[i])
        kmeans_opinions.setdefault(cid, []).append(o.opinion_text)
        kmeans_indices.setdefault(cid, []).append(i)

    # LLM groups k-means clusters into top-level positions
    hierarchy = _generate_hierarchical_labels(deliberation.question, kmeans_opinions, db)

    # Deduplicate: ensure each kmeans_id appears in exactly one top-level group
    seen_kmeans_ids: set[int] = set()
    for group in hierarchy["groups"]:
        original_ids = group.get("kmeans_ids", [])
        deduped = [kid for kid in original_ids if kid not in seen_kmeans_ids]
        if len(deduped) < len(original_ids):
            removed = set(original_ids) - set(deduped)
            logger.warning(
                f"Duplicate kmeans_ids {removed} in group '{group.get('label')}' — "
                f"k-means clusters don't cleanly map to LLM positions. Deduplicating."
            )
            sub_labels = group.get("sub_labels", {})
            group["sub_labels"] = {k: v for k, v in sub_labels.items() if int(k) not in removed}
        group["kmeans_ids"] = deduped
        seen_kmeans_ids.update(deduped)

    hierarchy["groups"] = [g for g in hierarchy["groups"] if g.get("kmeans_ids")]

    opinion_mapping: dict[int, tuple[int, int]] = {}

    sub_counts = [len(g.get("kmeans_ids", [])) for g in hierarchy["groups"]]
    top_labels = [g.get("label", "") for g in hierarchy["groups"]]
    top_colors, sub_color_lists = _generate_cluster_colors(len(hierarchy["groups"]), sub_counts, top_labels)

    clusters_info = []
    for top_id, group in enumerate(hierarchy["groups"]):
        top_label = group.get("label", f"Group {top_id + 1}")
        kmeans_ids = group.get("kmeans_ids", [])
        sub_labels = group.get("sub_labels", {})

        top_count = sum(len(kmeans_indices.get(kid, [])) for kid in kmeans_ids)

        sub_clusters_info = []
        for sub_id, kid in enumerate(kmeans_ids):
            indices = kmeans_indices.get(kid, [])
            sub_label = sub_labels.get(str(kid), f"Subgroup {sub_id + 1}")
            sub_color = sub_color_lists[top_id][sub_id] if sub_id < len(sub_color_lists[top_id]) else top_colors[top_id]

            for idx in indices:
                opinion_mapping[idx] = (top_id, sub_id)

            if len(kmeans_ids) > 1:
                sub_clusters_info.append({
                    "sub_cluster_id": sub_id,
                    "label": sub_label,
                    "color": sub_color,
                    "count": len(indices),
                    "percentage": round(len(indices) / total * 100, 1),
                })

        clusters_info.append({
            "cluster_id": top_id,
            "label": top_label,
            "color": top_colors[top_id],
            "count": top_count,
            "percentage": round(top_count / total * 100, 1),
            "sub_clusters": sub_clusters_info,
        })

    # Build points
    points = [
        {
            "id": str(o.id),
            "agent_id": str(o.agent_id),
            "agent_name": agent_name_map.get(o.agent_id, "Agent"),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
            "cluster": opinion_mapping.get(i, (0, 0))[0],
            "sub_cluster": opinion_mapping.get(i, (0, 0))[1],
            "opinion_text": o.opinion_text,
        }
        for i, o in enumerate(embedded)
    ]

    return {
        "points": points,
        "clusters": clusters_info,
        "total": total,
        "deliberation_id": str(deliberation.id),
    }


@router.get(
    "/{deliberation_id}/opinion-cluster",
    response_model=OpinionClusterResponse,
    summary="Get PCA-clustered opinion positions with auto-detected clusters"
)
async def get_opinion_cluster(
    deliberation_id: str,
    request: Request,
    agent: Optional[Agent] = Depends(OptionalAPIKeyAuth()),
    db: Session = Depends(get_db),
):
    """
    Return 2D PCA coordinates for opinions with k-means clustering.
    Results are cached on the deliberation and only recomputed when the
    set of opinions changes (new opinion or updated version).
    """
    try:
        deliberation_id = resolve_deliberation_id(db, deliberation_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    enforce_deliberation_access(db, deliberation, agent=agent, request=request)

    # Get latest opinion per agent
    all_opinions = db.query(Opinion).filter(Opinion.deliberation_id == deliberation_id).all()
    latest = _latest_opinions(all_opinions)

    if len(latest) < 2:
        return OpinionClusterResponse(points=[], clusters=[], total=0, deliberation_id=str(deliberation_id))

    # Check if cached result is still valid
    current_hash = _opinion_set_hash(latest)
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    if deliberation.opinion_cluster_cache is not None:
        hash_matches = deliberation.opinion_cluster_hash == current_hash
        within_ttl = (
            deliberation.opinion_cluster_cached_at is not None
            and (now - deliberation.opinion_cluster_cached_at).total_seconds() < CLUSTER_CACHE_TTL_SECONDS
        )
        # Return cache if: nothing changed, OR opinions changed but TTL hasn't expired
        if hash_matches or within_ttl:
            return OpinionClusterResponse(**deliberation.opinion_cluster_cache)

    # Cache miss — recompute
    logger.info(f"Opinion cluster cache miss for deliberation {deliberation_id}, recomputing...")
    result = _compute_opinion_clusters(deliberation, latest, db)

    # Persist cache
    deliberation.opinion_cluster_cache = result
    deliberation.opinion_cluster_hash = current_hash
    deliberation.opinion_cluster_cached_at = now
    db.commit()

    return OpinionClusterResponse(**result)
