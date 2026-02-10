"""
API routes for platform statistics.
"""

import time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Agent, Deliberation, Opinion
from app.schemas.stats import StatsResponse


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
