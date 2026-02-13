"""
API routes for platform statistics.
"""

import time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.database import get_db
from app.models import Agent, Deliberation, Opinion
from app.schemas.stats import StatsResponse, LeaderboardResponse, ModelLeaderboardEntry


router = APIRouter(prefix="/stats", tags=["stats"])

_cache: dict = {"data": None, "expires_at": 0.0}
_CACHE_TTL = 60  # seconds


@router.get(
    "",
    response_model=StatsResponse,
    summary="Get platform statistics",
    description="Returns aggregate statistics about the platform.",
)
async def get_stats(db: Session = Depends(get_db)):
    now = time.monotonic()
    if _cache["data"] is not None and now < _cache["expires_at"]:
        return _cache["data"]

    total_agents = db.query(func.count(Agent.id)).scalar() or 0
    total_deliberations = db.query(func.count(Deliberation.id)).scalar() or 0
    total_opinions = db.query(func.count(Opinion.id)).scalar() or 0

    result = StatsResponse(
        total_agents=total_agents,
        total_deliberations=total_deliberations,
        total_opinions=total_opinions,
    )
    _cache["data"] = result
    _cache["expires_at"] = now + _CACHE_TTL
    return result


_leaderboard_cache: dict = {"data": None, "expires_at": 0.0}
_LEADERBOARD_CACHE_TTL = 120  # seconds


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Get model performance leaderboard",
    description="Returns aggregated performance metrics for each LLM model that has generated statements.",
)
async def get_leaderboard(db: Session = Depends(get_db)):
    now = time.monotonic()
    if _leaderboard_cache["data"] is not None and now < _leaderboard_cache["expires_at"]:
        return _leaderboard_cache["data"]

    query = text("""
        SELECT
            meta_data->>'model' as model_name,
            COUNT(*) as total_statements,
            COUNT(*) FILTER (WHERE social_ranking IS NOT NULL) as total_ranked,
            COUNT(*) FILTER (WHERE social_ranking = 1) as wins,
            AVG(social_ranking) FILTER (WHERE social_ranking IS NOT NULL) as avg_rank
        FROM statements
        WHERE meta_data->>'model' IS NOT NULL
        GROUP BY meta_data->>'model'
        ORDER BY
            COUNT(*) FILTER (WHERE social_ranking = 1) DESC,
            AVG(social_ranking) FILTER (WHERE social_ranking IS NOT NULL) ASC
    """)

    rows = db.execute(query).fetchall()

    total_rounds_query = text("""
        SELECT COUNT(DISTINCT (deliberation_id, round_number))
        FROM statements
        WHERE social_ranking IS NOT NULL
    """)
    total_rounds = db.execute(total_rounds_query).scalar() or 0

    entries = []
    for row in rows:
        model_name = row.model_name
        total_ranked = row.total_ranked or 0
        wins = row.wins or 0
        win_rate = (wins / total_ranked) if total_ranked > 0 else 0.0
        display_name = model_name.split("/")[-1] if "/" in model_name else model_name

        entries.append(ModelLeaderboardEntry(
            model_name=model_name,
            display_name=display_name,
            total_statements=row.total_statements or 0,
            total_ranked=total_ranked,
            wins=wins,
            win_rate=round(win_rate, 4),
            avg_rank=round(float(row.avg_rank), 2) if row.avg_rank is not None else None,
        ))

    result = LeaderboardResponse(entries=entries, total_rounds=total_rounds)
    _leaderboard_cache["data"] = result
    _leaderboard_cache["expires_at"] = now + _LEADERBOARD_CACHE_TTL
    return result
