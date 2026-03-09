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
from app.api.private_deliberations import check_private_access, _find_user_agent
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
    limit: int = Query(48, ge=1, le=500),
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
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()

    if not deliberation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deliberation not found"
        )

    # Private deliberation access control
    if deliberation.is_private:
        if not agent:
            # Try human auth via X-User-Id for web UI users
            user_id = request.headers.get("X-User-Id")
            if user_id:
                user_agent = _find_user_agent(db, user_id)
                if user_agent:
                    check_private_access(db, deliberation, user_agent)
                else:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is a private deliberation")
            else:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This is a private deliberation")
        else:
            check_private_access(db, deliberation, agent)

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
        )
        for i, s in enumerate(embedded)
    ]

    return ClusterResponse(points=points, total=len(points), deliberation_id=str(deliberation_id))


# ─── Cluster colors for opinion clusters ─────────────────────────────────────
OPINION_CLUSTER_COLORS = [
    "#c84a20", "#2a6fb0", "#9b3a8a", "#1a8a50", "#6b4ac8",
    "#c43030", "#0a8a9a", "#b07a10", "#b0306a", "#0a7a5a",
]


def _find_optimal_k(matrix: np.ndarray, max_k: int = 8) -> int:
    """Find the optimal number of clusters using silhouette score."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    n = matrix.shape[0]
    if n < 3:
        return 1
    max_k = min(max_k, n - 1)
    if max_k < 2:
        return 1

    best_k = 2
    best_score = -1.0
    for k in range(2, max_k + 1):
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(matrix)
        score = silhouette_score(matrix, labels)
        if score > best_score:
            best_score = score
            best_k = k
    return best_k


def _generate_cluster_labels(
    question: str,
    clusters: dict[int, list[str]],
    db: Session,
) -> dict[int, str]:
    """Use LLM to generate short labels for each opinion cluster."""
    from app.services.llm_client import LLMClient

    cluster_summaries = []
    for cid in sorted(clusters.keys()):
        opinions = clusters[cid]
        joined = "\n---\n".join(opinions[:5])  # max 5 per cluster for prompt size
        cluster_summaries.append(f"Cluster {cid}:\n{joined}")

    prompt = (
        f"Deliberation question: \"{question}\"\n\n"
        f"Below are opinion clusters from agents participating in this deliberation. "
        f"Each cluster contains semantically similar opinions.\n\n"
        + "\n\n".join(cluster_summaries)
        + "\n\nFor each cluster, generate a short descriptive label (3-6 words) that captures "
        f"the shared perspective. Return ONLY a JSON object mapping cluster number to label, "
        f"e.g. {{\"0\": \"Pro-regulation optimists\", \"1\": \"Free market advocates\"}}. "
        f"No other text."
    )

    try:
        client = LLMClient()
        client.set_trace_context(trace_type="opinion_cluster_labels")
        raw = client.sample_text(prompt, temperature=0.3, max_tokens=512)
        import json
        # Extract JSON from response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            labels = json.loads(raw[start:end])
            return {int(k): str(v) for k, v in labels.items()}
    except Exception as e:
        logger.warning(f"Failed to generate cluster labels: {e}")

    # Fallback: generic labels
    return {cid: f"Group {cid + 1}" for cid in clusters}


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
    """Compute opinion clusters from scratch: embed, PCA, k-means, LLM labels.
    Returns the full response dict ready for JSON serialization + caching."""
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

    # K-means clustering with optimal k
    from sklearn.cluster import KMeans
    optimal_k = _find_optimal_k(matrix)
    km = KMeans(n_clusters=optimal_k, n_init=10, random_state=42)
    labels = km.fit_predict(matrix)

    # Build agent name map
    agent_ids = [o.agent_id for o in embedded]
    agents_db = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
    agent_name_map = {a.id: a.name for a in agents_db}

    # Build cluster -> opinion texts map for labeling
    cluster_opinions: dict[int, list[str]] = {}
    for i, o in enumerate(embedded):
        cid = int(labels[i])
        cluster_opinions.setdefault(cid, []).append(o.opinion_text)

    # Generate LLM labels
    cluster_labels = _generate_cluster_labels(deliberation.question, cluster_opinions, db)

    # Build points
    points = [
        {
            "id": str(o.id),
            "agent_id": str(o.agent_id),
            "agent_name": agent_name_map.get(o.agent_id, "Agent"),
            "x": float(coords[i, 0]),
            "y": float(coords[i, 1]),
            "cluster": int(labels[i]),
            "opinion_text": o.opinion_text,
        }
        for i, o in enumerate(embedded)
    ]

    total = len(embedded)
    clusters_info = [
        {
            "cluster_id": cid,
            "label": cluster_labels.get(cid, f"Group {cid + 1}"),
            "color": OPINION_CLUSTER_COLORS[cid % len(OPINION_CLUSTER_COLORS)],
            "count": len(ops),
            "percentage": round(len(ops) / total * 100, 1),
        }
        for cid, ops in sorted(cluster_opinions.items())
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
    deliberation_id: UUID,
    db: Session = Depends(get_db),
):
    """
    Return 2D PCA coordinates for opinions with k-means clustering.
    Results are cached on the deliberation and only recomputed when the
    set of opinions changes (new opinion or updated version).
    """
    deliberation = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not deliberation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deliberation not found")

    # Get latest opinion per agent
    all_opinions = db.query(Opinion).filter(Opinion.deliberation_id == deliberation_id).all()
    latest = _latest_opinions(all_opinions)

    if len(latest) < 2:
        return OpinionClusterResponse(points=[], clusters=[], total=0, deliberation_id=str(deliberation_id))

    # Check if cached result is still valid
    current_hash = _opinion_set_hash(latest)
    if (
        deliberation.opinion_cluster_cache is not None
        and deliberation.opinion_cluster_hash == current_hash
    ):
        return OpinionClusterResponse(**deliberation.opinion_cluster_cache)

    # Cache miss — recompute
    logger.info(f"Opinion cluster cache miss for deliberation {deliberation_id}, recomputing...")
    result = _compute_opinion_clusters(deliberation, latest, db)

    # Persist cache
    deliberation.opinion_cluster_cache = result
    deliberation.opinion_cluster_hash = current_hash
    db.commit()

    return OpinionClusterResponse(**result)
