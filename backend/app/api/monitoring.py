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
from fastapi import APIRouter, Depends, HTTPException, Header, Query
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


def verify_monitoring_secret(x_monitoring_secret: str = Header(...)):
    """Verify monitoring secret from header."""
    expected = settings.MONITORING_SECRET
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Monitoring is not configured. Set MONITORING_SECRET env var.",
        )
    if x_monitoring_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid monitoring secret")
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
    top_creation_agents = _top_agents_by_source("creation")
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
        top_creation_agents=top_creation_agents,
        top_interview_agents=top_interview_agents,
        top_chat_tool_agents=top_chat_tool_agents,
        top_deliberation_creators=top_deliberation_creators,
        opinions_by_source=opinions_by_source,
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
    from app.services.ranking_prediction_service import (
        SYSTEM_PROMPT as RANK_SYSTEM,
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
                description="Used when predicting where a past agent would rank a new statement",
                content=RANK_SYSTEM,
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
        if hasattr(model, 'created_at'):
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
        if "created_at" in columns:
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
