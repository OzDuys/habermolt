"""
API routes for monitoring and debugging.

Protected by MONITORING_SECRET environment variable.
Provides LLM trace inspection, platform stats, config viewing,
prompt inspection, skill file rendering, feedback viewing,
and database management.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy import func, desc, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    Agent, Deliberation, Opinion, Statement, Ranking,
    PlatformFeedback, LLMTrace, AgentRequestLog, WaitlistEmail,
    HostedAgent, AgentSession, Notification, ModerationLog,
    AgentRating, ConsensusRating, DeliberationMember,
)
from app.schemas.monitoring import (
    LLMTraceResponse, LLMTraceListResponse,
    MonitoringStatsResponse, SystemConfigResponse,
    SystemPromptsResponse, PromptEntry, SkillFilesResponse,
    TableInfoResponse, TableListResponse, BulkActionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

# Model-to-table mapping for database browser
TABLE_MAP = {
    "agents": Agent,
    "deliberations": Deliberation,
    "opinions": Opinion,
    "statements": Statement,
    "rankings": Ranking,
    "platform_feedback": PlatformFeedback,
    "llm_traces": LLMTrace,
    "agent_request_logs": AgentRequestLog,
    "waitlist_emails": WaitlistEmail,
    "hosted_agents": HostedAgent,
    "agent_sessions": AgentSession,
    "notifications": Notification,
    "moderation_logs": ModerationLog,
}


def verify_monitoring_secret(request: Request, x_monitoring_secret: str = Header(...)):
    """Verify monitoring secret and user allowlist.

    Requires:
    1. Valid MONITORING_SECRET header (always)
    2. Valid session from MONITORING_ALLOWED_USERS allowlist (when configured)
    """
    expected = settings.MONITORING_SECRET
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Monitoring is not configured. Set MONITORING_SECRET env var.",
        )
    if x_monitoring_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid monitoring secret")

    # If an allowlist is configured, require a valid session from an allowed user
    allowed_users = settings.monitoring_allowed_user_list
    if allowed_users:
        user_id = request.headers.get("X-User-Id")
        if not user_id:
            raise HTTPException(status_code=403, detail="Authentication required for monitoring access")
        # Validate the internal secret to prevent user ID forgery
        if settings.INTERNAL_API_SECRET:
            internal_secret = request.headers.get("X-Internal-Secret")
            if internal_secret != settings.INTERNAL_API_SECRET:
                raise HTTPException(status_code=403, detail="Authentication required for monitoring access")
        if user_id not in allowed_users:
            raise HTTPException(status_code=403, detail="Your account is not authorized for monitoring access")

    return True


# ─── LLM Traces ──────────────────────────────────────────────────────────────


@router.get("/traces", response_model=LLMTraceListResponse)
async def get_traces(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    trace_type: Optional[str] = None,
    status: Optional[str] = None,
    model: Optional[str] = None,
    deliberation_id: Optional[str] = None,
    hosted_agent_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    query = db.query(LLMTrace)
    if trace_type:
        query = query.filter(LLMTrace.trace_type == trace_type)
    if status:
        query = query.filter(LLMTrace.status == status)
    if model:
        query = query.filter(LLMTrace.model.ilike(f"%{model}%"))
    if deliberation_id:
        query = query.filter(LLMTrace.deliberation_id == deliberation_id)
    if hosted_agent_id:
        query = query.filter(LLMTrace.hosted_agent_id == hosted_agent_id)

    total = query.count()
    traces = (
        query.order_by(desc(LLMTrace.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return LLMTraceListResponse(
        traces=[LLMTraceResponse.model_validate(t, from_attributes=True) for t in traces],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/traces/{trace_id}", response_model=LLMTraceResponse)
async def get_trace_detail(
    trace_id: str,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    trace = db.query(LLMTrace).filter(LLMTrace.id == trace_id).first()
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return LLMTraceResponse.model_validate(trace, from_attributes=True)


# ─── Dashboard Stats ─────────────────────────────────────────────────────────


@router.get("/stats", response_model=MonitoringStatsResponse)
async def get_monitoring_stats(
    period: Optional[str] = Query(None, regex="^(week|month)$"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    # Compute cutoff for time-filtered queries (None = all time)
    cutoff = None
    if period == "week":
        cutoff = datetime.utcnow() - timedelta(days=7)
    elif period == "month":
        cutoff = datetime.utcnow() - timedelta(days=30)

    # Platform totals (filtered by created_at / submitted_at / generated_at)
    agents_q = db.query(func.count(Agent.id))
    deliberations_q = db.query(func.count(Deliberation.id))
    opinions_q = db.query(func.count(Opinion.id))
    statements_q = db.query(func.count(Statement.id))
    rankings_q = db.query(func.count(Ranking.id))
    if cutoff:
        agents_q = agents_q.filter(Agent.created_at >= cutoff)
        deliberations_q = deliberations_q.filter(Deliberation.created_at >= cutoff)
        opinions_q = opinions_q.filter(Opinion.submitted_at >= cutoff)
        statements_q = statements_q.filter(Statement.generated_at >= cutoff)
        rankings_q = rankings_q.filter(Ranking.submitted_at >= cutoff)

    total_agents = agents_q.scalar() or 0
    total_deliberations = deliberations_q.scalar() or 0
    total_opinions = opinions_q.scalar() or 0
    total_statements = statements_q.scalar() or 0
    total_rankings = rankings_q.scalar() or 0

    # LLM trace stats (filtered by created_at)
    def trace_q():
        q = db.query(LLMTrace)
        if cutoff:
            q = q.filter(LLMTrace.created_at >= cutoff)
        return q

    total_traces = trace_q().with_entities(func.count(LLMTrace.id)).scalar() or 0
    total_errors = trace_q().filter(LLMTrace.status == "error").with_entities(func.count(LLMTrace.id)).scalar() or 0
    error_rate = (total_errors / total_traces) if total_traces > 0 else 0.0

    tokens_base = db.query(
        func.coalesce(func.sum(LLMTrace.tokens_in), 0),
        func.coalesce(func.sum(LLMTrace.tokens_out), 0),
    )
    if cutoff:
        tokens_base = tokens_base.filter(LLMTrace.created_at >= cutoff)
    tokens_agg = tokens_base.first()
    total_tokens_in = tokens_agg[0]
    total_tokens_out = tokens_agg[1]

    latency_base = db.query(func.avg(LLMTrace.latency_ms)).filter(LLMTrace.latency_ms.isnot(None))
    if cutoff:
        latency_base = latency_base.filter(LLMTrace.created_at >= cutoff)
    avg_latency = latency_base.scalar() or 0.0

    type_base = db.query(LLMTrace.trace_type, func.count(LLMTrace.id))
    if cutoff:
        type_base = type_base.filter(LLMTrace.created_at >= cutoff)
    traces_by_type = dict(type_base.group_by(LLMTrace.trace_type).all())

    model_base = db.query(LLMTrace.model, func.count(LLMTrace.id))
    if cutoff:
        model_base = model_base.filter(LLMTrace.created_at >= cutoff)
    traces_by_model = dict(model_base.group_by(LLMTrace.model).all())

    traces_24h = db.query(func.count(LLMTrace.id)).filter(
        LLMTrace.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).scalar() or 0

    # Cost aggregations
    cost_base = db.query(func.coalesce(func.sum(LLMTrace.cost_total), 0.0))
    if cutoff:
        cost_base = cost_base.filter(LLMTrace.created_at >= cutoff)
    total_cost = cost_base.scalar()

    cbm_base = (
        db.query(LLMTrace.model, func.coalesce(func.sum(LLMTrace.cost_total), 0.0))
        .filter(LLMTrace.cost_total.isnot(None))
    )
    if cutoff:
        cbm_base = cbm_base.filter(LLMTrace.created_at >= cutoff)
    cost_by_model = {row[0]: round(float(row[1]), 6) for row in cbm_base.group_by(LLMTrace.model).all()}

    cost_24h = db.query(
        func.coalesce(func.sum(LLMTrace.cost_total), 0.0)
    ).filter(
        LLMTrace.created_at >= datetime.utcnow() - timedelta(hours=24)
    ).scalar()

    lbm_base = (
        db.query(LLMTrace.model, func.avg(LLMTrace.latency_ms))
        .filter(LLMTrace.latency_ms.isnot(None))
    )
    if cutoff:
        lbm_base = lbm_base.filter(LLMTrace.created_at >= cutoff)
    latency_by_model = {row[0]: round(float(row[1]), 1) for row in lbm_base.group_by(LLMTrace.model).all()}

    # Interaction leaderboards by opinion source
    def _top_agents_by_source(source: str) -> list:
        q = (
            db.query(Agent.name, func.count(Opinion.id).label("cnt"))
            .join(Agent, Opinion.agent_id == Agent.id)
            .filter(Opinion.source == source)
        )
        if cutoff:
            q = q.filter(Opinion.submitted_at >= cutoff)
        rows = q.group_by(Agent.name).order_by(desc("cnt")).limit(15).all()
        return [{"agent_name": name, "count": count} for name, count in rows]

    top_autonomous_agents = _top_agents_by_source("autonomous")
    top_api_agents = _top_agents_by_source("api")
    top_interview_agents = _top_agents_by_source("topic_interview")
    top_chat_tool_agents = _top_agents_by_source("chat_tool")

    # Top deliberation creators
    delib_q = (
        db.query(Agent.name, func.count(Deliberation.id).label("cnt"))
        .join(Agent, Deliberation.created_by_agent_id == Agent.id)
    )
    if cutoff:
        delib_q = delib_q.filter(Deliberation.created_at >= cutoff)
    top_deliberation_creators = [
        {"agent_name": name, "count": count}
        for name, count in delib_q.group_by(Agent.name).order_by(desc("cnt")).limit(15).all()
    ]

    # Opinions breakdown by source
    src_base = db.query(Opinion.source, func.count(Opinion.id))
    if cutoff:
        src_base = src_base.filter(Opinion.submitted_at >= cutoff)
    opinions_by_source = {
        (src or "unknown"): count
        for src, count in src_base.group_by(Opinion.source).all()
    }

    # Cost by trace type
    cbt_base = (
        db.query(LLMTrace.trace_type, func.coalesce(func.sum(LLMTrace.cost_total), 0.0))
        .filter(LLMTrace.cost_total.isnot(None))
    )
    if cutoff:
        cbt_base = cbt_base.filter(LLMTrace.created_at >= cutoff)
    cost_by_type = {row[0]: round(float(row[1]), 6) for row in cbt_base.group_by(LLMTrace.trace_type).all()}

    # Average token usage by trace type
    avg_tok_base = db.query(
        LLMTrace.trace_type,
        func.avg(LLMTrace.tokens_in),
        func.avg(LLMTrace.tokens_out),
        func.avg(LLMTrace.tokens_in + LLMTrace.tokens_out),
    ).filter(LLMTrace.tokens_in.isnot(None), LLMTrace.tokens_out.isnot(None))
    if cutoff:
        avg_tok_base = avg_tok_base.filter(LLMTrace.created_at >= cutoff)
    avg_tokens_by_type = {
        trace_type: {
            "avg_in": round(float(avg_in or 0)),
            "avg_out": round(float(avg_out or 0)),
            "avg_total": round(float(avg_total or 0)),
        }
        for trace_type, avg_in, avg_out, avg_total
        in avg_tok_base.group_by(LLMTrace.trace_type).all()
    }

    # Total token usage by trace type
    sum_tok_base = db.query(
        LLMTrace.trace_type,
        func.coalesce(func.sum(LLMTrace.tokens_in), 0),
        func.coalesce(func.sum(LLMTrace.tokens_out), 0),
        func.coalesce(func.sum(LLMTrace.tokens_in + LLMTrace.tokens_out), 0),
    ).filter(LLMTrace.tokens_in.isnot(None), LLMTrace.tokens_out.isnot(None))
    if cutoff:
        sum_tok_base = sum_tok_base.filter(LLMTrace.created_at >= cutoff)
    total_tokens_by_type = {
        trace_type: {
            "total_in": int(total_in),
            "total_out": int(total_out),
            "total": int(total),
        }
        for trace_type, total_in, total_out, total
        in sum_tok_base.group_by(LLMTrace.trace_type).all()
    }

    return MonitoringStatsResponse(
        total_agents=total_agents,
        total_deliberations=total_deliberations,
        total_opinions=total_opinions,
        total_statements=total_statements,
        total_rankings=total_rankings,
        total_traces=total_traces,
        total_errors=total_errors,
        error_rate=round(error_rate, 4),
        total_tokens_in=total_tokens_in,
        total_tokens_out=total_tokens_out,
        avg_latency_ms=round(float(avg_latency), 1),
        traces_by_type=traces_by_type,
        traces_by_model=traces_by_model,
        traces_24h=traces_24h,
        latency_by_model=latency_by_model,
        total_cost=round(float(total_cost), 6),
        cost_by_model=cost_by_model,
        cost_24h=round(float(cost_24h), 6),
        top_autonomous_agents=top_autonomous_agents,
        top_api_agents=top_api_agents,
        top_interview_agents=top_interview_agents,
        top_chat_tool_agents=top_chat_tool_agents,
        top_deliberation_creators=top_deliberation_creators,
        opinions_by_source=opinions_by_source,
        cost_by_type=cost_by_type,
        avg_tokens_by_type=avg_tokens_by_type,
        total_tokens_by_type=total_tokens_by_type,
    )


# ─── System Configuration ────────────────────────────────────────────────────


@router.get("/config", response_model=SystemConfigResponse)
async def get_system_config(_auth: bool = Depends(verify_monitoring_secret)):
    return SystemConfigResponse(
        habermas_num_candidates=settings.HABERMAS_NUM_CANDIDATES,
        habermas_llm_model=settings.HABERMAS_LLM_MODEL,
        habermas_llm_models=settings.habermas_model_list,
        habermas_llm_temperature=settings.HABERMAS_LLM_TEMPERATURE,
        habermas_num_retries=settings.HABERMAS_NUM_RETRIES,
        continuous_num_seed_statements=settings.CONTINUOUS_NUM_SEED_STATEMENTS,
        continuous_num_seed_opinions=settings.CONTINUOUS_NUM_SEED_OPINIONS,
        continuous_max_statements=settings.CONTINUOUS_MAX_STATEMENTS,
        continuous_max_statements_per_agent=settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT,
        embedding_model=settings.EMBEDDING_MODEL,
        similarity_threshold=settings.SIMILARITY_THRESHOLD,
        llm_base_url=settings.LLM_BASE_URL,
        environment=settings.ENVIRONMENT,
    )


# ─── System Prompts ──────────────────────────────────────────────────────────


@router.get("/prompts", response_model=SystemPromptsResponse)
async def get_system_prompts(_auth: bool = Depends(verify_monitoring_secret)):
    from app.services.statement_service import (
        SYSTEM_PROMPT as STMT_SYSTEM,
        _build_opinion_only_prompt,
    )

    # Reconstruct the seed opinion prompt template
    seed_opinion_template = (
        'A group is deliberating on the following question:\n'
        '"{question}"\n\n'
        'One participant has already expressed this view:\n'
        '<opinion>{creator_opinion}</opinion>\n\n'
        'Generate {num} diverse perspectives on this topic.\n\n'
        'CRITICAL: The perspectives must span the FULL spectrum of views on this '
        'topic, not cluster around a moderate center. Include:\n'
        '- At least one strong YES/FOR position\n'
        '- At least one strong NO/AGAINST position\n'
        '- At least one nuanced or conditional position\n'
        '- At least one perspective that reframes the question entirely\n\n'
        'Each perspective should be fundamentally different in its conclusion, '
        'not just different reasoning for the same moderate position.\n\n'
        'Format as a numbered list. Return ONLY the numbered list, one perspective per line.'
    )

    # Title differentiation prompt template
    title_diff_template = (
        'Below are {n} candidate consensus statements on the same topic. '
        'Each needs a SHORT, DISTINCTIVE title (5-10 words max) that highlights '
        'what makes it DIFFERENT from the others.\n\n'
        'Statements:\n{statements}\n\n'
        'For each statement, write a title that captures its unique angle, emphasis, '
        'or tradeoff. Two titles should NEVER be similar.\n\n'
        'Respond with ONLY a numbered list of titles, one per line.'
    )

    # Example user prompts
    opinion_only_example = _build_opinion_only_prompt(
        "Should we implement universal basic income?",
        ["I believe UBI would help...", "I'm skeptical about UBI because..."],
    )
    return SystemPromptsResponse(
        prompts=[
            PromptEntry(
                name="Statement Generation — System Prompt",
                description="Used for all statement generation LLM calls",
                content=STMT_SYSTEM,
            ),
            PromptEntry(
                name="Statement Generation — User Prompt (Opinion Only)",
                description="User prompt template for generating statements from opinions. Example with 2 opinions.",
                content=opinion_only_example,
            ),
            PromptEntry(
                name="Ranking Prediction — System Prompt",
                description="LLM ranking prediction removed — new statements inserted at median position",
                content="(No LLM prompt — median insertion used as temporary fix)",
            ),
            PromptEntry(
                name="Seed Opinion Generation — User Prompt Template",
                description="Used to generate diverse synthetic opinions for seeding continuous deliberations",
                content=seed_opinion_template,
            ),
            PromptEntry(
                name="Title Differentiation — User Prompt Template",
                description="Used to regenerate statement titles so each one is distinctive",
                content=title_diff_template,
            ),
        ]
    )


# ─── Skill Files ─────────────────────────────────────────────────────────────


@router.get("/skill-files", response_model=SkillFilesResponse)
async def get_skill_files(_auth: bool = Depends(verify_monitoring_secret)):
    """Fetch rendered skill.md and heartbeat.md from the frontend."""
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    skill_md = ""
    heartbeat_md = ""

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{frontend_url}/skill.md")
            if resp.status_code == 200:
                skill_md = resp.text
        except Exception as e:
            skill_md = f"Error fetching skill.md: {e}"

        try:
            resp = await client.get(f"{frontend_url}/heartbeat.md")
            if resp.status_code == 200:
                heartbeat_md = resp.text
        except Exception as e:
            heartbeat_md = f"Error fetching heartbeat.md: {e}"

    return SkillFilesResponse(skill_md=skill_md, heartbeat_md=heartbeat_md)


# ─── Platform Feedback ───────────────────────────────────────────────────────


@router.get("/feedback")
async def get_platform_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    query = db.query(PlatformFeedback).order_by(desc(PlatformFeedback.submitted_at))
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "feedback": [
            {
                "id": str(f.id),
                "agent_id": str(f.agent_id),
                "user_id": f.user_id,
                "feedback_text": f.feedback_text,
                "category": f.category,
                "submitted_at": f.submitted_at.isoformat() if f.submitted_at else None,
            }
            for f in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ─── Deliberation Debug ──────────────────────────────────────────────────────


@router.get("/deliberations/{deliberation_id}/debug")
async def get_deliberation_debug(
    deliberation_id: str,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    delib = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    opinions = db.query(Opinion).filter(Opinion.deliberation_id == deliberation_id).all()
    statements = (
        db.query(Statement)
        .filter(Statement.deliberation_id == deliberation_id)
        .order_by(Statement.social_ranking)
        .all()
    )
    rankings = db.query(Ranking).filter(Ranking.deliberation_id == deliberation_id).all()
    traces = (
        db.query(LLMTrace)
        .filter(LLMTrace.deliberation_id == deliberation_id)
        .order_by(desc(LLMTrace.created_at))
        .all()
    )

    # Build agent lookup
    agent_ids = set()
    for o in opinions:
        agent_ids.add(o.agent_id)
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all() if agent_ids else []
    agent_map = {str(a.id): a.name for a in agents}

    return {
        "deliberation": {
            "id": str(delib.id),
            "question": delib.question,
            "stage": str(delib.stage.value) if hasattr(delib.stage, 'value') else str(delib.stage),
            "mechanism_type": str(delib.mechanism_type.value) if hasattr(delib.mechanism_type, 'value') else str(delib.mechanism_type),
            "num_citizens": delib.num_citizens,
            "created_at": delib.created_at.isoformat() if delib.created_at else None,
            "updated_at": delib.updated_at.isoformat() if delib.updated_at else None,
            "meta_data": delib.meta_data,
        },
        "opinions": [
            {
                "id": str(o.id),
                "agent_id": str(o.agent_id),
                "agent_name": agent_map.get(str(o.agent_id), "Unknown"),
                "opinion_text": o.opinion_text,
                "submitted_at": o.submitted_at.isoformat() if o.submitted_at else None,
            }
            for o in opinions
        ],
        "statements": [
            {
                "id": str(s.id),
                "title": s.title,
                "statement_text": s.statement_text,
                "social_ranking": s.social_ranking,
                "is_seed": s.is_seed,
                "contributed_by_agent_id": str(s.contributed_by_agent_id) if s.contributed_by_agent_id else None,
                "meta_data": s.meta_data,
                "generated_at": s.generated_at.isoformat() if s.generated_at else None,
            }
            for s in statements
        ],
        "rankings": [
            {
                "id": str(r.id),
                "agent_id": str(r.agent_id),
                "agent_name": agent_map.get(str(r.agent_id), "Unknown"),
                "statement_rankings": r.statement_rankings,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            }
            for r in rankings
        ],
        "traces": [
            LLMTraceResponse.model_validate(t, from_attributes=True).model_dump(mode="json")
            for t in traces
        ],
    }


# ─── Database Management ─────────────────────────────────────────────────────


@router.get("/tables", response_model=TableListResponse)
async def list_tables(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """List all tables with row counts (including tables without SQLAlchemy models)."""
    # Discover all user tables from the database itself
    result = db.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    ))
    all_table_names = [row[0] for row in result]

    tables = []
    for name in all_table_names:
        count_result = db.execute(text(f'SELECT COUNT(*) FROM "{name}"'))
        count = count_result.scalar() or 0
        tables.append(TableInfoResponse(name=name, row_count=count))
    return TableListResponse(tables=tables)


@router.get("/tables/{table_name}")
async def get_table_rows(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: Optional[str] = Query(None),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Get paginated rows for a table (works for both modeled and unmodeled tables)."""
    # Verify table exists in the database
    exists = db.execute(text(
        "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = :name"
    ), {"name": table_name}).first()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table_name}")

    model = TABLE_MAP.get(table_name)

    if model:
        # Use SQLAlchemy model for modeled tables
        total = db.query(func.count(model.id)).scalar() or 0
        columns = [c.name for c in model.__table__.columns]

        query = db.query(model)
        if sort_by and sort_by in columns:
            col_attr = getattr(model, sort_by)
            query = query.order_by(desc(col_attr) if sort_dir == "desc" else col_attr)
        elif hasattr(model, 'created_at'):
            query = query.order_by(desc(model.created_at))
        elif hasattr(model, 'submitted_at'):
            query = query.order_by(desc(model.submitted_at))
        elif hasattr(model, 'generated_at'):
            query = query.order_by(desc(model.generated_at))

        rows = query.offset((page - 1) * page_size).limit(page_size).all()

        serialized = []
        for row in rows:
            row_dict = {}
            for col in columns:
                val = getattr(row, col, None)
                if val is None:
                    row_dict[col] = None
                elif isinstance(val, (UUID,)):
                    row_dict[col] = str(val)
                elif isinstance(val, datetime):
                    row_dict[col] = val.isoformat()
                elif hasattr(val, 'value'):  # Enum
                    row_dict[col] = str(val.value)
                elif isinstance(val, (dict, list)):
                    row_dict[col] = val
                else:
                    row_dict[col] = str(val) if not isinstance(val, (int, float, bool)) else val
            serialized.append(row_dict)
    else:
        # Raw SQL fallback for unmodeled tables
        total_result = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
        total = total_result.scalar() or 0

        # Get column names from information_schema
        col_result = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :name "
            "ORDER BY ordinal_position"
        ), {"name": table_name})
        columns = [row[0] for row in col_result]

        # Determine ordering column
        if sort_by and sort_by in columns:
            order_col = sort_by
            order_dir = sort_dir.upper()
        elif "created_at" in columns:
            order_col = "created_at"
            order_dir = "DESC"
        elif "submitted_at" in columns:
            order_col = "submitted_at"
            order_dir = "DESC"
        elif "generated_at" in columns:
            order_col = "generated_at"
            order_dir = "DESC"
        elif "id" in columns:
            order_col = "id"
            order_dir = "ASC"
        else:
            order_col = columns[0]
            order_dir = "ASC"

        offset = (page - 1) * page_size
        rows_result = db.execute(text(
            f'SELECT * FROM "{table_name}" ORDER BY "{order_col}" {order_dir} '
            f'LIMIT :limit OFFSET :offset'
        ), {"limit": page_size, "offset": offset})

        serialized = []
        for row in rows_result:
            row_dict = {}
            for i, col in enumerate(columns):
                val = row[i]
                if val is None:
                    row_dict[col] = None
                elif isinstance(val, datetime):
                    row_dict[col] = val.isoformat()
                elif isinstance(val, (dict, list)):
                    row_dict[col] = val
                elif isinstance(val, (int, float, bool)):
                    row_dict[col] = val
                else:
                    row_dict[col] = str(val)
            serialized.append(row_dict)

    return {
        "table_name": table_name,
        "columns": columns,
        "rows": serialized,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.delete("/tables/{table_name}/{row_id}")
async def delete_table_row(
    table_name: str,
    row_id: str,
    x_confirm: str = Header(..., alias="X-Confirm"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Delete a single row by ID."""
    if x_confirm != "true":
        raise HTTPException(status_code=400, detail="Confirmation required (X-Confirm: true)")

    model = TABLE_MAP.get(table_name)
    if model:
        row = db.query(model).filter(model.id == row_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Row not found")
        db.delete(row)
    else:
        # Verify table exists
        exists = db.execute(text(
            "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = :name"
        ), {"name": table_name}).first()
        if not exists:
            raise HTTPException(status_code=404, detail=f"Unknown table: {table_name}")
        result = db.execute(
            text(f'DELETE FROM "{table_name}" WHERE id = :rid'),
            {"rid": row_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Row not found")

    db.commit()
    return {"message": f"Deleted row {row_id} from {table_name}"}


@router.delete("/deliberations/{deliberation_id}")
async def delete_deliberation_cascade(
    deliberation_id: str,
    x_confirm: str = Header(..., alias="X-Confirm"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Delete a deliberation and all related data (cascading)."""
    if x_confirm != "true":
        raise HTTPException(status_code=400, detail="Confirmation required (X-Confirm: true)")

    delib = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    # Delete in dependency order — must cover ALL tables with FK to deliberations
    db.query(LLMTrace).filter(LLMTrace.deliberation_id == deliberation_id).delete()
    db.query(AgentRating).filter(AgentRating.deliberation_id == deliberation_id).delete()
    db.query(ConsensusRating).filter(ConsensusRating.deliberation_id == deliberation_id).delete()
    db.query(AgentRequestLog).filter(AgentRequestLog.deliberation_id == deliberation_id).delete()
    db.query(AgentSession).filter(AgentSession.deliberation_id == deliberation_id).delete()
    db.query(DeliberationMember).filter(DeliberationMember.deliberation_id == deliberation_id).delete()
    db.execute(text("DELETE FROM human_feedback WHERE deliberation_id = :did"), {"did": deliberation_id})
    db.execute(text("DELETE FROM critiques WHERE deliberation_id = :did"), {"did": deliberation_id})
    db.query(Ranking).filter(Ranking.deliberation_id == deliberation_id).delete()
    db.query(Statement).filter(Statement.deliberation_id == deliberation_id).delete()
    db.query(Opinion).filter(Opinion.deliberation_id == deliberation_id).delete()
    db.delete(delib)
    db.commit()

    return {"message": f"Deleted deliberation {deliberation_id} and all related data"}


@router.post("/deliberations/{deliberation_id}/regenerate-statements")
async def regenerate_seed_statements(
    deliberation_id: str,
    x_confirm: str = Header(..., alias="X-Confirm"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Regenerate seed statements for a deliberation that has none.

    Uses existing opinions to generate statements. Fixes the chicken-and-egg
    problem where agents can't rank (no statements) and can't propose (must rank first).
    """
    if x_confirm != "true":
        raise HTTPException(status_code=400, detail="Confirmation required (X-Confirm: true)")

    delib = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    existing_statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation_id
    ).count()
    if existing_statements > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Deliberation already has {existing_statements} statements",
        )

    opinions = db.query(Opinion).filter(
        Opinion.deliberation_id == deliberation_id
    ).all()
    opinion_texts = [o.opinion_text for o in opinions]
    if not opinion_texts:
        raise HTTPException(
            status_code=400,
            detail="Deliberation has no opinions to generate statements from",
        )

    from app.services.statement_service import statement_service

    seed_statements = await statement_service.generate_statements(
        db, delib, opinion_texts, seed_opinions=opinion_texts,
    )

    for stmt in seed_statements:
        stmt.is_seed = True
    db.commit()

    return {
        "message": f"Generated {len(seed_statements)} seed statements",
        "deliberation_id": deliberation_id,
        "statement_count": len(seed_statements),
        "statements": [
            {"id": str(s.id), "title": s.title, "text": s.statement_text}
            for s in seed_statements
        ],
    }


@router.post("/bulk-actions/delete-empty-deliberations", response_model=BulkActionResponse)
async def delete_empty_deliberations(
    x_confirm: str = Header(..., alias="X-Confirm"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Delete deliberations with no statements."""
    if x_confirm != "true":
        raise HTTPException(status_code=400, detail="Confirmation required (X-Confirm: true)")

    # Find deliberations with zero statements
    result = db.execute(text("""
        SELECT d.id FROM deliberations d
        LEFT JOIN statements s ON s.deliberation_id = d.id
        GROUP BY d.id
        HAVING COUNT(s.id) = 0
    """))
    target_ids = [row[0] for row in result]

    if not target_ids:
        return BulkActionResponse(deleted_count=0, message="No deliberations with zero statements found")

    for did in target_ids:
        db.query(LLMTrace).filter(LLMTrace.deliberation_id == did).delete()
        db.execute(text("DELETE FROM human_feedback WHERE deliberation_id = :did"), {"did": str(did)})
        db.execute(text("DELETE FROM critiques WHERE deliberation_id = :did"), {"did": str(did)})
        db.query(Ranking).filter(Ranking.deliberation_id == did).delete()
        db.query(Opinion).filter(Opinion.deliberation_id == did).delete()
        db.query(Deliberation).filter(Deliberation.id == did).delete()

    db.commit()
    return BulkActionResponse(
        deleted_count=len(target_ids),
        message=f"Deleted {len(target_ids)} deliberation(s) with no statements",
    )


@router.post("/bulk-actions/delete-seed-only-deliberations", response_model=BulkActionResponse)
async def delete_seed_only_deliberations(
    x_confirm: str = Header(..., alias="X-Confirm"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Delete deliberations that only have seed statements (no user-contributed)."""
    if x_confirm != "true":
        raise HTTPException(status_code=400, detail="Confirmation required (X-Confirm: true)")

    result = db.execute(text("""
        SELECT d.id FROM deliberations d
        LEFT JOIN statements s ON s.deliberation_id = d.id
        GROUP BY d.id
        HAVING COUNT(s.id) = COUNT(s.id) FILTER (WHERE s.is_seed = TRUE)
           AND COUNT(s.id) > 0
    """))
    target_ids = [row[0] for row in result]

    if not target_ids:
        return BulkActionResponse(deleted_count=0, message="No deliberations with only seed statements found")

    for did in target_ids:
        db.query(LLMTrace).filter(LLMTrace.deliberation_id == did).delete()
        db.execute(text("DELETE FROM human_feedback WHERE deliberation_id = :did"), {"did": str(did)})
        db.execute(text("DELETE FROM critiques WHERE deliberation_id = :did"), {"did": str(did)})
        db.query(Ranking).filter(Ranking.deliberation_id == did).delete()
        db.query(Statement).filter(Statement.deliberation_id == did).delete()
        db.query(Opinion).filter(Opinion.deliberation_id == did).delete()
        db.query(Deliberation).filter(Deliberation.id == did).delete()

    db.commit()
    return BulkActionResponse(
        deleted_count=len(target_ids),
        message=f"Deleted {len(target_ids)} deliberation(s) with only seed statements",
    )


# ─── Agent Request Logs ───────────────────────────────────────────────────────


@router.get("/agent-requests")
async def get_agent_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    agent_id: Optional[str] = None,
    deliberation_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """List agent API calls, optionally filtered by agent, deliberation, or endpoint."""
    from app.models import AgentRequestLog
    from app.schemas.monitoring import AgentRequestLogResponse, AgentRequestLogListResponse

    query = db.query(AgentRequestLog)
    if agent_id:
        query = query.filter(AgentRequestLog.agent_id == agent_id)
    if deliberation_id:
        query = query.filter(AgentRequestLog.deliberation_id == deliberation_id)
    if endpoint:
        query = query.filter(AgentRequestLog.endpoint == endpoint)

    total = query.count()
    logs = (
        query.order_by(desc(AgentRequestLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return AgentRequestLogListResponse(
        logs=[AgentRequestLogResponse.model_validate(log, from_attributes=True) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Moderation Logs ────────────────────────────────────────────────────────


@router.get("/moderation-logs")
async def get_moderation_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),  # "passed", "failed", or None for all
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """List moderation check results, newest first. Filter by passed/failed."""
    query = db.query(ModerationLog)
    if status_filter == "failed":
        query = query.filter(ModerationLog.passed == False)  # noqa: E712
    elif status_filter == "passed":
        query = query.filter(ModerationLog.passed == True)  # noqa: E712

    total = query.count()
    logs = (
        query.order_by(desc(ModerationLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "logs": [
            {
                "id": str(log.id),
                "question": log.question,
                "passed": log.passed,
                "reason": log.reason,
                "source": log.source,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ─── Email Management ────────────────────────────────────────────────────────


def _resolve_agent_for_user(db: Session, user_id: str) -> tuple[str, str] | None:
    """Resolve (agent_id, agent_name) for a user. Checks hosted agents first, then OpenClaw agents.
    Returns None if no agent found."""
    from app.models.agent import Agent

    ha = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if ha:
        return str(ha.agent_id), ha.display_name

    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if agent:
        return str(agent.id), agent.name

    return None


def _get_all_agents_with_users(db: Session, user_ids: list[str] | None = None) -> list[tuple[str, str, str]]:
    """Get all (user_id, agent_id, agent_name) tuples for users with agents.
    Includes both hosted and OpenClaw agents."""
    from app.models.agent import Agent

    results = []
    seen_user_ids = set()

    # Hosted agents first
    ha_query = db.query(HostedAgent).filter(HostedAgent.is_active == True)
    if user_ids:
        ha_query = ha_query.filter(HostedAgent.user_id.in_(user_ids))
    for ha in ha_query.all():
        results.append((ha.user_id, str(ha.agent_id), ha.display_name))
        seen_user_ids.add(ha.user_id)

    # OpenClaw agents (only those claimed by a user and not already covered by hosted)
    agent_query = db.query(Agent).filter(
        Agent.user_id.isnot(None),
        Agent.api_key.isnot(None),  # active (not deactivated)
    )
    if user_ids:
        agent_query = agent_query.filter(Agent.user_id.in_(user_ids))
    for agent in agent_query.all():
        if agent.user_id not in seen_user_ids:
            results.append((agent.user_id, str(agent.id), agent.name))

    return results


@router.post("/send-weekly-summaries", dependencies=[Depends(verify_monitoring_secret)])
async def send_weekly_summaries(
    db: Session = Depends(get_db),
    user_ids: Optional[list[str]] = None,
):
    """Send weekly summary emails to opted-in users (or specific user_ids)."""
    from app.services.email_service import get_or_create_email_preference, send_weekly_summary_email
    from app.services.weekly_summary_service import get_weekly_summary
    import time

    all_agents = _get_all_agents_with_users(db, user_ids)

    sent = 0
    skipped = 0
    errors = 0
    details = []

    for user_id, agent_id, agent_name in all_agents:
        try:
            # Check email preference
            pref = get_or_create_email_preference(db, user_id)
            db.commit()
            if not pref.weekly_summary:
                skipped += 1
                details.append({"user_id": user_id, "agent": agent_name, "status": "opted_out"})
                continue

            # Get summary
            summary = get_weekly_summary(db, agent_id, user_id=user_id)
            if summary["is_empty"]:
                skipped += 1
                details.append({"user_id": user_id, "agent": agent_name, "status": "empty"})
                continue

            # Get user email
            row = db.execute(
                text('SELECT name, email FROM "user" WHERE id = :uid'),
                {"uid": user_id},
            ).fetchone()
            if not row or not row[1]:
                skipped += 1
                details.append({"user_id": user_id, "agent": agent_name, "status": "no_email"})
                continue

            ok = send_weekly_summary_email(
                db, row[1], row[0] or "there", agent_name, summary, pref.unsubscribe_token,
            )
            if ok:
                sent += 1
                details.append({"user_id": user_id, "agent": agent_name, "status": "sent"})
            else:
                errors += 1
                details.append({"user_id": user_id, "agent": agent_name, "status": "error"})

            # Brief delay to respect Resend rate limits
            time.sleep(0.2)
        except Exception as e:
            errors += 1
            details.append({"user_id": user_id, "agent": agent_name, "status": "error", "error": str(e)})

    return {"sent": sent, "skipped": skipped, "errors": errors, "total": len(all_agents), "details": details}


@router.post("/preview-weekly-summary", dependencies=[Depends(verify_monitoring_secret)])
async def preview_weekly_summary(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Preview weekly summary data for a specific user (dry run, no email sent)."""
    from app.services.weekly_summary_service import get_weekly_summary

    resolved = _resolve_agent_for_user(db, user_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="No agent found for this user")
    agent_id, agent_name = resolved

    summary = get_weekly_summary(db, agent_id, user_id=user_id)

    row = db.execute(
        text('SELECT name, email FROM "user" WHERE id = :uid'),
        {"uid": user_id},
    ).fetchone()

    return {
        "user_id": user_id,
        "user_name": row[0] if row else None,
        "user_email": row[1] if row else None,
        "agent_name": agent_name,
        "summary": summary,
    }


@router.post("/render-weekly-summary", dependencies=[Depends(verify_monitoring_secret)])
async def render_weekly_summary(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Render the full weekly summary email HTML for preview (no email sent)."""
    from app.services.email_service import get_or_create_email_preference, render_weekly_summary_html
    from app.services.weekly_summary_service import get_weekly_summary
    from fastapi.responses import HTMLResponse

    resolved = _resolve_agent_for_user(db, user_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="No agent found for this user")
    agent_id, agent_name = resolved

    summary = get_weekly_summary(db, agent_id, user_id=user_id)

    row = db.execute(
        text('SELECT name, email FROM "user" WHERE id = :uid'),
        {"uid": user_id},
    ).fetchone()

    pref = get_or_create_email_preference(db, user_id)
    db.commit()

    html = render_weekly_summary_html(
        user_name=row[0] if row else "there",
        agent_name=agent_name,
        summary=summary,
        unsubscribe_token=pref.unsubscribe_token,
    )

    return HTMLResponse(content=html)


@router.post("/send-weekly-summary-to-user", dependencies=[Depends(verify_monitoring_secret)])
async def send_weekly_summary_to_user(
    user_id: str,
    db: Session = Depends(get_db),
):
    """Send weekly summary email to a specific user (ignores opt-out and empty check)."""
    from app.services.email_service import get_or_create_email_preference, send_weekly_summary_email
    from app.services.weekly_summary_service import get_weekly_summary

    resolved = _resolve_agent_for_user(db, user_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="No agent found for this user")
    agent_id, agent_name = resolved

    row = db.execute(
        text('SELECT name, email FROM "user" WHERE id = :uid'),
        {"uid": user_id},
    ).fetchone()
    if not row or not row[1]:
        raise HTTPException(status_code=404, detail="No email found for this user")

    pref = get_or_create_email_preference(db, user_id)
    db.commit()

    summary = get_weekly_summary(db, agent_id, user_id=user_id)

    ok = send_weekly_summary_email(
        db, row[1], row[0] or "there", agent_name, summary, pref.unsubscribe_token,
    )

    return {
        "sent": ok,
        "user_id": user_id,
        "email": row[1],
        "agent_name": agent_name,
        "summary_empty": summary["is_empty"],
    }


# ─── Token Usage ─────────────────────────────────────────────────────────────


@router.get("/token-usage")
async def get_token_usage(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Token usage breakdown for all hosted agents.

    Shows per-agent usage by trace type, duplicate heartbeat detection,
    and comparison of tracked (tokens_used_period) vs actual (sum of traces).
    """
    from app.services.hosted_agent_service import TOKEN_LIMITS

    tokens_col = func.coalesce(LLMTrace.tokens_in, 0) + func.coalesce(LLMTrace.tokens_out, 0)

    # Per-agent breakdown by trace type (since their billing period start)
    agents = (
        db.query(HostedAgent)
        .filter(HostedAgent.user_profile.isnot(None))
        .order_by(desc(HostedAgent.tokens_used_period))
        .all()
    )

    results = []
    for ha in agents:
        # Trace breakdown since billing period
        rows = (
            db.query(LLMTrace.trace_type, func.count().label("count"), func.sum(tokens_col).label("total"))
            .filter(
                LLMTrace.hosted_agent_id == ha.id,
                LLMTrace.created_at >= ha.billing_period_start,
            )
            .group_by(LLMTrace.trace_type)
            .all()
        )
        breakdown = {r.trace_type: {"count": r.count, "tokens": int(r.total or 0)} for r in rows}
        trace_total = sum(v["tokens"] for v in breakdown.values())

        # Duplicate heartbeat detection (< 60s apart) in current period
        hb_rows = (
            db.query(LLMTrace.created_at)
            .filter(
                LLMTrace.hosted_agent_id == ha.id,
                LLMTrace.trace_type == "hosted_agent_heartbeat",
                LLMTrace.created_at >= ha.billing_period_start,
            )
            .order_by(LLMTrace.created_at)
            .all()
        )
        dupe_count = 0
        for i in range(1, len(hb_rows)):
            if (hb_rows[i][0] - hb_rows[i - 1][0]).total_seconds() < 60:
                dupe_count += 1

        limit = TOKEN_LIMITS.get(ha.pricing_tier)
        results.append({
            "id": str(ha.id),
            "display_name": ha.display_name,
            "pricing_tier": ha.pricing_tier,
            "is_active": ha.is_active,
            "paused_reason": ha.paused_reason,
            "tokens_used_period": ha.tokens_used_period,
            "token_limit": limit,
            "trace_total": trace_total,
            "drift": ha.tokens_used_period - trace_total,
            "billing_period_start": ha.billing_period_start.isoformat(),
            "breakdown": breakdown,
            "duplicate_heartbeats": dupe_count,
            "total_heartbeats": len(hb_rows),
        })

    return {"agents": results}


@router.get("/heartbeat-timeseries")
async def get_heartbeat_timeseries(
    days: int = Query(30, ge=1, le=365),
    granularity: str = Query("day", regex="^(hour|day|week)$"),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Time-series of total vs duplicate heartbeats (< 60s apart per agent)."""
    rows = db.execute(text(f"""
        WITH hb AS (
            SELECT
                created_at,
                hosted_agent_id,
                LAG(created_at) OVER (
                    PARTITION BY hosted_agent_id ORDER BY created_at
                ) AS prev_at
            FROM llm_traces
            WHERE trace_type = 'hosted_agent_heartbeat'
              AND created_at >= now() - interval '{days} days'
        ),
        classified AS (
            SELECT
                date_trunc('{granularity}', created_at) AS bucket,
                CASE
                    WHEN prev_at IS NOT NULL
                     AND EXTRACT(EPOCH FROM (created_at - prev_at)) < 60
                    THEN 1 ELSE 0
                END AS is_dupe
            FROM hb
        )
        SELECT bucket, COUNT(*) AS total, SUM(is_dupe) AS dupes
        FROM classified
        GROUP BY 1
        ORDER BY 1
    """)).fetchall()

    row_map = {r.bucket: (int(r.total), int(r.dupes)) for r in rows}

    # Build contiguous bucket list
    now_dt = datetime.utcnow()
    cutoff_dt = now_dt - timedelta(days=days)
    if granularity == "week":
        cutoff_dt -= timedelta(days=cutoff_dt.weekday())
    if granularity == "hour":
        cutoff_dt = cutoff_dt.replace(minute=0, second=0, microsecond=0)
        step = timedelta(hours=1)
    elif granularity == "day":
        cutoff_dt = cutoff_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(days=1)
    else:
        cutoff_dt = cutoff_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(weeks=1)

    buckets = []
    cur = cutoff_dt
    while cur <= now_dt:
        vals = row_map.get(cur, (0, 0))
        buckets.append({
            "date": cur.strftime("%Y-%m-%dT%H:00" if granularity == "hour" else "%Y-%m-%d"),
            "total": vals[0],
            "dupes": vals[1],
        })
        cur += step

    return {"buckets": buckets, "granularity": granularity, "days": days}


# ─── User Behavior Analytics ────────────────────────────────────────────────


@router.get("/user-behavior")
async def get_user_behavior(
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Comprehensive user behavior analytics.

    Answers: how many people are using the platform, how deeply, and are they coming back?
    """
    # ── 1. All users from better-auth user table ──
    all_users = db.execute(
        text("""
            SELECT u.id, u.name, u.email, u."createdAt",
                   ha.id AS hosted_agent_id,
                   ha.display_name,
                   ha.onboarded,
                   ha.is_active AS agent_is_active,
                   ha.created_at AS agent_created_at,
                   ha.last_heartbeat_at,
                   ha.last_chatted_at,
                   ha.tokens_used_period,
                   ha.pricing_tier,
                   a.id AS agent_id,
                   a.last_active_at AS agent_last_active
            FROM "user" u
            LEFT JOIN hosted_agents ha ON ha.user_id = u.id
            LEFT JOIN agents a ON a.user_id = u.id
            ORDER BY u."createdAt" DESC
        """)
    ).fetchall()

    # ── 2. Per-agent participation stats ──
    # Opinions per agent (with source breakdown)
    opinion_stats = db.execute(
        text("""
            SELECT o.agent_id,
                   COUNT(*) AS total_opinions,
                   COUNT(DISTINCT o.deliberation_id) AS deliberations_with_opinion,
                   COUNT(*) FILTER (WHERE o.source = 'autonomous') AS autonomous_opinions,
                   COUNT(*) FILTER (WHERE o.source = 'topic_interview') AS interview_opinions,
                   COUNT(*) FILTER (WHERE o.source = 'chat_tool') AS chat_tool_opinions,
                   COUNT(*) FILTER (WHERE o.source = 'api') AS api_opinions,
                   COUNT(*) FILTER (WHERE o.source = 'creation') AS creation_opinions
            FROM opinions o
            GROUP BY o.agent_id
        """)
    ).fetchall()
    opinion_map = {str(r.agent_id): r for r in opinion_stats}

    # Rankings per agent
    ranking_stats = db.execute(
        text("""
            SELECT r.agent_id,
                   COUNT(*) AS total_rankings,
                   COUNT(*) FILTER (WHERE NOT EXISTS (
                       SELECT 1 FROM jsonb_array_elements(r.statement_rankings) elem
                       WHERE (elem->>'is_predicted')::boolean = true
                   )) AS fully_manual_rankings
            FROM rankings r
            GROUP BY r.agent_id
        """)
    ).fetchall()
    ranking_map = {str(r.agent_id): r for r in ranking_stats}

    # Statements contributed per agent (non-seed)
    statement_stats = db.execute(
        text("""
            SELECT contributed_by_agent_id AS agent_id,
                   COUNT(*) AS statements_proposed
            FROM statements
            WHERE contributed_by_agent_id IS NOT NULL AND NOT is_seed
            GROUP BY contributed_by_agent_id
        """)
    ).fetchall()
    statement_map = {str(r.agent_id): r.statements_proposed for r in statement_stats}

    # Deliberations created per agent
    delib_created = db.execute(
        text("""
            SELECT created_by_agent_id AS agent_id,
                   COUNT(*) AS deliberations_created
            FROM deliberations
            WHERE created_by_agent_id IS NOT NULL
            GROUP BY created_by_agent_id
        """)
    ).fetchall()
    delib_created_map = {str(r.agent_id): r.deliberations_created for r in delib_created}

    # Chat sessions per user
    chat_sessions = db.execute(
        text("""
            SELECT user_id,
                   COUNT(*) AS total_sessions,
                   COUNT(*) FILTER (WHERE session_type = 'deliberation') AS deliberation_sessions,
                   COUNT(*) FILTER (WHERE session_type = 'general') AS general_sessions,
                   MAX(created_at) AS last_session_at
            FROM agent_sessions
            WHERE user_id IS NOT NULL
            GROUP BY user_id
        """)
    ).fetchall()
    chat_map = {r.user_id: r for r in chat_sessions}

    # Notifications per user (feedback engagement)
    notification_stats = db.execute(
        text("""
            SELECT user_id,
                   COUNT(*) AS total_notifications,
                   COUNT(*) FILTER (WHERE approval_status IS NOT NULL) AS reviewed_notifications,
                   COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved,
                   COUNT(*) FILTER (WHERE approval_status = 'disapproved') AS disapproved
            FROM notifications
            WHERE type = 'agent_action'
            GROUP BY user_id
        """)
    ).fetchall()
    notif_map = {r.user_id: r for r in notification_stats}

    # Consensus ratings per user
    consensus_rating_stats = db.execute(
        text("""
            SELECT user_id,
                   COUNT(*) AS total_ratings,
                   COUNT(*) FILTER (WHERE thumb_vote = 'up') AS thumbs_up,
                   COUNT(*) FILTER (WHERE thumb_vote = 'down') AS thumbs_down
            FROM consensus_ratings
            GROUP BY user_id
        """)
    ).fetchall()
    consensus_map = {r.user_id: r for r in consensus_rating_stats}

    # Profile stats per hosted agent
    profile_stats = db.execute(
        text("""
            SELECT ha.user_id,
                   array_length(regexp_split_to_array(trim(ha.user_profile::text), '\s+'), 1) AS profile_words,
                   ha.profile_version
            FROM hosted_agents ha
            WHERE ha.user_profile IS NOT NULL
        """)
    ).fetchall()
    profile_map = {r.user_id: {"profile_words": r.profile_words or 0, "profile_version": r.profile_version or 0} for r in profile_stats}

    # Interview details per user (deliberation chat sessions)
    interview_stats = db.execute(
        text("""
            SELECT s.user_id,
                   COUNT(*) FILTER (WHERE s.phase = 'browsing') AS browsing_sessions,
                   COUNT(*) FILTER (WHERE s.phase = 'participating') AS participating_sessions,
                   SUM(jsonb_array_length(s.messages)) AS total_messages,
                   SUM(jsonb_array_length(s.messages)) FILTER (WHERE s.phase = 'browsing') AS browsing_messages,
                   SUM(jsonb_array_length(s.messages)) FILTER (WHERE s.phase = 'participating') AS participating_messages
            FROM agent_sessions s
            WHERE s.session_type = 'deliberation' AND s.user_id IS NOT NULL
            GROUP BY s.user_id
        """)
    ).fetchall()
    interview_map = {r.user_id: r for r in interview_stats}

    # General chat sessions per user
    general_chat_stats = db.execute(
        text("""
            SELECT s.user_id,
                   COUNT(*) AS general_sessions,
                   SUM(jsonb_array_length(s.messages)) AS general_messages
            FROM agent_sessions s
            WHERE s.session_type = 'general' AND s.user_id IS NOT NULL
            GROUP BY s.user_id
        """)
    ).fetchall()
    general_chat_map = {r.user_id: r for r in general_chat_stats}

    # Per-agent: deliberations joined by source (distinct deliberation_ids)
    delib_by_source = db.execute(
        text("""
            SELECT o.agent_id,
                   COUNT(DISTINCT o.deliberation_id) FILTER (WHERE o.source = 'autonomous') AS auto_delibs,
                   COUNT(DISTINCT o.deliberation_id) FILTER (WHERE o.source = 'topic_interview') AS interview_delibs,
                   COUNT(DISTINCT o.deliberation_id) FILTER (WHERE o.source = 'chat_tool') AS chat_delibs,
                   COUNT(DISTINCT o.deliberation_id) FILTER (WHERE o.source = 'creation') AS creation_delibs
            FROM opinions o
            GROUP BY o.agent_id
        """)
    ).fetchall()
    delib_source_map = {str(r.agent_id): r for r in delib_by_source}

    # Last human activity per user (notification reviews, consensus ratings)
    human_activity = db.execute(
        text("""
            SELECT user_id, MAX(ts) AS last_human_at FROM (
                SELECT user_id, GREATEST(COALESCE(corrected_at, read_at), COALESCE(read_at, corrected_at)) AS ts
                FROM notifications
                WHERE corrected_at IS NOT NULL OR read_at IS NOT NULL
                UNION ALL
                SELECT user_id, submitted_at AS ts
                FROM consensus_ratings
            ) sub
            WHERE ts IS NOT NULL
            GROUP BY user_id
        """)
    ).fetchall()
    human_activity_map = {r.user_id: r.last_human_at for r in human_activity}

    # LLM trace activity per hosted agent (for last-active tracking)
    llm_activity = db.execute(
        text("""
            SELECT hosted_agent_id,
                   COUNT(*) AS total_traces,
                   MAX(created_at) AS last_trace_at,
                   MIN(created_at) AS first_trace_at
            FROM llm_traces
            WHERE hosted_agent_id IS NOT NULL
            GROUP BY hosted_agent_id
        """)
    ).fetchall()
    llm_map = {str(r.hosted_agent_id): r for r in llm_activity}

    # ── 3. Build per-user rows ──
    users = []
    for u in all_users:
        agent_id = str(u.agent_id) if u.agent_id else None
        hosted_agent_id = str(u.hosted_agent_id) if u.hosted_agent_id else None

        op = opinion_map.get(agent_id) if agent_id else None
        rk = ranking_map.get(agent_id) if agent_id else None
        ch = chat_map.get(u.id)
        nt = notif_map.get(u.id)
        cr = consensus_map.get(u.id)
        st_count = statement_map.get(agent_id, 0) if agent_id else 0
        dc_count = delib_created_map.get(agent_id, 0) if agent_id else 0
        llm = llm_map.get(hosted_agent_id) if hosted_agent_id else None
        prof = profile_map.get(u.id)
        iv = interview_map.get(u.id)
        gc = general_chat_map.get(u.id)
        ds = delib_source_map.get(agent_id) if agent_id else None

        # Determine last activity (split human vs agent)
        human_dates = []
        agent_dates = []
        # Human activity: chatting, sessions, notification reviews, consensus ratings
        if u.last_chatted_at:
            human_dates.append(u.last_chatted_at)
        if ch and ch.last_session_at:
            human_dates.append(ch.last_session_at)
        ha_date = human_activity_map.get(u.id)
        if ha_date:
            human_dates.append(ha_date)
        # Agent activity: heartbeats, API calls, LLM traces
        if u.agent_last_active:
            agent_dates.append(u.agent_last_active)
        if u.last_heartbeat_at:
            agent_dates.append(u.last_heartbeat_at)
        if llm and llm.last_trace_at:
            agent_dates.append(llm.last_trace_at)
        last_human_active = max(human_dates).isoformat() if human_dates else None
        last_agent_active = max(agent_dates).isoformat() if agent_dates else None
        all_dates = human_dates + agent_dates
        last_active = max(all_dates).isoformat() if all_dates else None

        deliberations_participated = (op.deliberations_with_opinion if op else 0)

        users.append({
            "user_id": u.id,
            "name": u.name,
            "email": u.email,
            "signed_up_at": u.createdAt.isoformat() if u.createdAt else None,
            "has_agent": agent_id is not None,
            "has_hosted_agent": hosted_agent_id is not None,
            "agent_name": u.display_name,
            "onboarded": bool(u.onboarded) if u.onboarded is not None else False,
            "agent_is_active": bool(u.agent_is_active) if u.agent_is_active is not None else False,
            "pricing_tier": u.pricing_tier,
            "last_active": last_active,
            "last_human_active": last_human_active,
            "last_agent_active": last_agent_active,
            "deliberations_participated": deliberations_participated,
            "deliberations_created": dc_count,
            "total_opinions": op.total_opinions if op else 0,
            "autonomous_opinions": op.autonomous_opinions if op else 0,
            "interview_opinions": op.interview_opinions if op else 0,
            "chat_tool_opinions": op.chat_tool_opinions if op else 0,
            "total_rankings": rk.total_rankings if rk else 0,
            "statements_proposed": st_count,
            "chat_sessions": ch.total_sessions if ch else 0,
            "deliberation_chat_sessions": ch.deliberation_sessions if ch else 0,
            "notifications_reviewed": nt.reviewed_notifications if nt else 0,
            "notifications_total": nt.total_notifications if nt else 0,
            "consensus_ratings": cr.total_ratings if cr else 0,
            # Learning & autonomy fields
            "profile_words": prof["profile_words"] if prof else 0,
            "profile_version": prof["profile_version"] if prof else 0,
            "interview_sessions": iv.browsing_sessions + iv.participating_sessions if iv else 0,
            "interview_messages": iv.total_messages if iv else 0,
            "browsing_sessions": iv.browsing_sessions if iv else 0,
            "participating_sessions": iv.participating_sessions if iv else 0,
            "general_chat_sessions": gc.general_sessions if gc else 0,
            "general_chat_messages": gc.general_messages if gc else 0,
            "delibs_joined_autonomous": ds.auto_delibs if ds else 0,
            "delibs_joined_interview": ds.interview_delibs if ds else 0,
            "delibs_joined_chat": ds.chat_delibs if ds else 0,
            "delibs_joined_creation": ds.creation_delibs if ds else 0,
        })

    # ── 4. Funnel stats ──
    total_users = len(all_users)
    users_with_agent = sum(1 for u in users if u["has_agent"])
    users_with_hosted_agent = sum(1 for u in users if u["has_hosted_agent"])
    users_onboarded = sum(1 for u in users if u["onboarded"])
    users_participated = sum(1 for u in users if u["deliberations_participated"] > 0)
    users_multi_delib = sum(1 for u in users if u["deliberations_participated"] > 1)
    users_created_delib = sum(1 for u in users if u["deliberations_created"] > 0)
    users_chatted = sum(1 for u in users if u["chat_sessions"] > 0)
    users_reviewed_actions = sum(1 for u in users if u["notifications_reviewed"] > 0)
    users_rated_consensus = sum(1 for u in users if u["consensus_ratings"] > 0)

    # Retention: active in last 7 days, last 30 days
    now = datetime.utcnow()
    users_active_7d = sum(
        1 for u in users
        if u["last_active"] and datetime.fromisoformat(u["last_active"].replace("Z", "+00:00")).replace(tzinfo=None) > now - timedelta(days=7)
    )
    users_active_30d = sum(
        1 for u in users
        if u["last_active"] and datetime.fromisoformat(u["last_active"].replace("Z", "+00:00")).replace(tzinfo=None) > now - timedelta(days=30)
    )

    # Engagement depth distribution
    engagement_buckets = {"0_deliberations": 0, "1_deliberation": 0, "2_to_5": 0, "6_plus": 0}
    for u in users:
        n = u["deliberations_participated"]
        if n == 0:
            engagement_buckets["0_deliberations"] += 1
        elif n == 1:
            engagement_buckets["1_deliberation"] += 1
        elif n <= 5:
            engagement_buckets["2_to_5"] += 1
        else:
            engagement_buckets["6_plus"] += 1

    # Signup cohorts (by week)
    cohorts = {}
    for u in users:
        if u["signed_up_at"]:
            dt = datetime.fromisoformat(u["signed_up_at"])
            week_start = (dt - timedelta(days=dt.weekday())).strftime("%Y-%m-%d")
            if week_start not in cohorts:
                cohorts[week_start] = {"signed_up": 0, "onboarded": 0, "participated": 0, "returned": 0}
            cohorts[week_start]["signed_up"] += 1
            if u["onboarded"]:
                cohorts[week_start]["onboarded"] += 1
            if u["deliberations_participated"] > 0:
                cohorts[week_start]["participated"] += 1
            if u["last_active"] and datetime.fromisoformat(u["last_active"].replace("Z", "+00:00")).replace(tzinfo=None) > now - timedelta(days=7):
                cohorts[week_start]["returned"] += 1

    # Sort cohorts by week
    sorted_cohorts = dict(sorted(cohorts.items()))

    # ── 5. Learning & autonomy aggregates ──
    users_with_profile = [u for u in users if u["profile_words"] > 0]
    users_with_interviews = [u for u in users if u["interview_sessions"] > 0]
    users_with_auto = [u for u in users if u["delibs_joined_autonomous"] > 0]

    avg_profile_words = (
        sum(u["profile_words"] for u in users_with_profile) / len(users_with_profile)
        if users_with_profile else 0
    )
    avg_profile_version = (
        sum(u["profile_version"] for u in users_with_profile) / len(users_with_profile)
        if users_with_profile else 0
    )

    total_interview_delibs = sum(u["delibs_joined_interview"] for u in users)
    total_auto_delibs = sum(u["delibs_joined_autonomous"] for u in users)
    total_chat_delibs = sum(u["delibs_joined_chat"] for u in users)
    total_creation_delibs = sum(u["delibs_joined_creation"] for u in users)

    return {
        "funnel": {
            "total_users": total_users,
            "users_with_agent": users_with_agent,
            "users_with_hosted_agent": users_with_hosted_agent,
            "users_onboarded": users_onboarded,
            "users_participated": users_participated,
            "users_multi_delib": users_multi_delib,
            "users_created_delib": users_created_delib,
            "users_chatted": users_chatted,
            "users_reviewed_actions": users_reviewed_actions,
            "users_rated_consensus": users_rated_consensus,
        },
        "retention": {
            "active_7d": users_active_7d,
            "active_30d": users_active_30d,
        },
        "learning": {
            "users_with_profile": len(users_with_profile),
            "avg_profile_words": round(avg_profile_words),
            "avg_profile_version": round(avg_profile_version, 1),
            "users_interviewed": len(users_with_interviews),
            "users_autonomous": len(users_with_auto),
            "total_interview_delibs": total_interview_delibs,
            "total_auto_delibs": total_auto_delibs,
            "total_chat_delibs": total_chat_delibs,
            "total_creation_delibs": total_creation_delibs,
        },
        "engagement_buckets": engagement_buckets,
        "cohorts": sorted_cohorts,
        "users": users,
    }


# ─── Growth Timeseries ───────────────────────────────────────────────────────


@router.get("/growth-timeseries")
async def get_growth_timeseries(
    granularity: str = Query("week", regex="^(hour|day|week)$"),
    days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
    _auth: bool = Depends(verify_monitoring_secret),
):
    """Bucketed time-series for platform growth and activity trends."""
    trunc = granularity  # 'day' or 'week'
    interval = f"{days} days"

    user_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', "createdAt") AS bucket, COUNT(*) AS cnt
        FROM "user"
        WHERE "createdAt" >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    agent_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', created_at) AS bucket, COUNT(*) AS cnt
        FROM agents
        WHERE created_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    delib_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', created_at) AS bucket, COUNT(*) AS cnt
        FROM deliberations
        WHERE created_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    opinion_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', submitted_at) AS bucket,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE source IN ('autonomous', 'api')) AS agent_cnt,
               COUNT(*) FILTER (WHERE source IN ('topic_interview', 'chat_tool', 'creation')) AS user_cnt
        FROM opinions
        WHERE submitted_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    ranking_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', submitted_at) AS bucket, COUNT(*) AS cnt
        FROM rankings
        WHERE submitted_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    statement_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', generated_at) AS bucket, COUNT(*) AS cnt
        FROM statements
        WHERE generated_at >= now() - interval '{interval}'
          AND NOT is_seed AND contributed_by_agent_id IS NOT NULL
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    trace_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', created_at) AS bucket,
               COUNT(*) AS traces,
               COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens,
               COALESCE(SUM(cost_total), 0.0) AS cost
        FROM llm_traces
        WHERE created_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    active_agent_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', submitted_at) AS bucket,
               COUNT(DISTINCT agent_id) AS active_agents
        FROM opinions
        WHERE submitted_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    error_rate_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', created_at) AS bucket,
               COUNT(*) AS total_traces,
               COUNT(*) FILTER (WHERE status = 'error') AS error_traces
        FROM llm_traces
        WHERE created_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    consensus_change_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', (elem->>'lost_at')::timestamp) AS bucket,
               COUNT(*) AS changes
        FROM deliberations,
             jsonb_array_elements(meta_data->'consensus_history') AS elem
        WHERE meta_data ? 'consensus_history'
          AND (elem->>'lost_at') IS NOT NULL
          AND (elem->>'lost_at')::timestamp >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    notif_rows = db.execute(text(f"""
        SELECT date_trunc('{trunc}', created_at) AS bucket,
               COUNT(*) AS total_notifs,
               COUNT(*) FILTER (WHERE approval_status IS NOT NULL) AS reviewed_notifs
        FROM notifications
        WHERE type = 'agent_action'
          AND created_at >= now() - interval '{interval}'
        GROUP BY 1 ORDER BY 1
    """)).fetchall()

    users_before = db.execute(text(f"""
        SELECT COUNT(*) FROM "user" WHERE "createdAt" < now() - interval '{interval}'
    """)).scalar() or 0

    agents_before = db.execute(text(f"""
        SELECT COUNT(*) FROM agents WHERE created_at < now() - interval '{interval}'
    """)).scalar() or 0

    # Build full bucket list in the date range
    now_dt = datetime.utcnow()
    cutoff_dt = now_dt - timedelta(days=days)
    if granularity == "week":
        cutoff_dt -= timedelta(days=cutoff_dt.weekday())  # align to Monday
    if granularity == "hour":
        cutoff_dt = cutoff_dt.replace(minute=0, second=0, microsecond=0)
        step = timedelta(hours=1)
    elif granularity == "day":
        cutoff_dt = cutoff_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(days=1)
    else:
        cutoff_dt = cutoff_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(weeks=1)

    bucket_fmt = "%Y-%m-%dT%H:00" if granularity == "hour" else "%Y-%m-%d"
    all_buckets = []
    cur = cutoff_dt
    while cur <= now_dt:
        all_buckets.append(cur.strftime(bucket_fmt))
        cur += step

    def to_date_str(v):
        if not hasattr(v, "strftime"):
            s = str(v)
            return s[:13] + ":00" if granularity == "hour" else s[:10]
        return v.strftime(bucket_fmt)

    user_map = {to_date_str(r.bucket): int(r.cnt) for r in user_rows}
    agent_map = {to_date_str(r.bucket): int(r.cnt) for r in agent_rows}
    delib_map = {to_date_str(r.bucket): int(r.cnt) for r in delib_rows}
    op_total_map = {to_date_str(r.bucket): int(r.total) for r in opinion_rows}
    op_agent_map = {to_date_str(r.bucket): int(r.agent_cnt) for r in opinion_rows}
    op_user_map = {to_date_str(r.bucket): int(r.user_cnt) for r in opinion_rows}
    ranking_map_d = {to_date_str(r.bucket): int(r.cnt) for r in ranking_rows}
    statement_map_d = {to_date_str(r.bucket): int(r.cnt) for r in statement_rows}
    trace_map_d = {
        to_date_str(r.bucket): (int(r.traces), int(r.tokens), float(r.cost))
        for r in trace_rows
    }
    active_agent_map = {to_date_str(r.bucket): int(r.active_agents) for r in active_agent_rows}
    error_rate_map = {
        to_date_str(r.bucket): (int(r.total_traces), int(r.error_traces))
        for r in error_rate_rows
    }
    consensus_change_map = {to_date_str(r.bucket): int(r.changes) for r in consensus_change_rows}
    notif_map_d = {
        to_date_str(r.bucket): (int(r.total_notifs), int(r.reviewed_notifs))
        for r in notif_rows
    }

    result = []
    for b in all_buckets:
        t = trace_map_d.get(b, (0, 0, 0.0))
        et = error_rate_map.get(b, (0, 0))
        nm = notif_map_d.get(b, (0, 0))
        result.append({
            "date": b,
            "new_users": user_map.get(b, 0),
            "new_agents": agent_map.get(b, 0),
            "deliberations_created": delib_map.get(b, 0),
            "opinions_total": op_total_map.get(b, 0),
            "agent_opinions": op_agent_map.get(b, 0),
            "user_opinions": op_user_map.get(b, 0),
            "rankings": ranking_map_d.get(b, 0),
            "statements_proposed": statement_map_d.get(b, 0),
            "llm_traces": t[0],
            "tokens_used": t[1],
            "cost": round(t[2], 6),
            "active_agents": active_agent_map.get(b, 0),
            "llm_error_rate": round(et[1] / et[0], 4) if et[0] > 0 else None,
            "consensus_changes": consensus_change_map.get(b, 0),
            "notifications_total": nm[0],
            "notifications_reviewed": nm[1],
            "notification_review_rate": round(nm[1] / nm[0], 4) if nm[0] > 0 else None,
        })

    return {
        "buckets": result,
        "granularity": granularity,
        "days": days,
        "totals_at_start": {"users": int(users_before), "agents": int(agents_before)},
    }
