"""
API routes for Deliberation of the Day (DotD).
"""

import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.database import get_db
from app.middleware.auth import require_user_id
from app.config import settings
from app.models import Deliberation, Opinion, Ranking, Statement
from app.schemas.deliberation import DeliberationResponse
from app.schemas.dotd import DotdResponse, DotdOverrideRequest
from app.services.dotd_service import DotdService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dotd", tags=["dotd"])


def _enrich_deliberation_response(db: Session, deliberation: Deliberation) -> DeliberationResponse:
    """Build a DeliberationResponse with activity counts."""
    resp = DeliberationResponse.from_orm(deliberation)
    resp.created_by_name = deliberation.creator.name if deliberation.creator else None
    resp.num_opinions = db.query(func.count()).filter(
        Opinion.deliberation_id == deliberation.id
    ).scalar()
    resp.num_agent_statements = db.query(func.count()).filter(
        Statement.deliberation_id == deliberation.id,
        Statement.is_seed == False,
    ).scalar()
    resp.num_rankings = db.query(func.count()).filter(
        Ranking.deliberation_id == deliberation.id
    ).scalar()
    return resp


@router.get(
    "/current",
    summary="Get today's Deliberation of the Day",
)
async def get_current_dotd(
    db: Session = Depends(get_db),
):
    """
    Returns today's DotD. Lazily creates it if it doesn't exist yet
    (from yesterday's meta-deliberation or algorithmic fallback).
    Also ensures tomorrow's meta-deliberation exists.

    Returns null if there are no eligible deliberations.
    """
    service = DotdService(db)
    selection = service.get_current_dotd()

    if not selection:
        return None

    # Load the featured deliberation with its creator
    deliberation = db.query(Deliberation).options(
        joinedload(Deliberation.creator)
    ).filter(Deliberation.id == selection.deliberation_id).first()

    if not deliberation:
        return None

    # Find meta-deliberation for tomorrow (for the voting card)
    from datetime import timedelta, timezone, datetime
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    meta_delib = service.get_meta_deliberation_for_date(tomorrow)

    return DotdResponse(
        deliberation=_enrich_deliberation_response(db, deliberation),
        featured_date=selection.featured_date,
        selection_method=selection.selection_method,
        meta_deliberation_id=str(selection.meta_deliberation_id) if selection.meta_deliberation_id else None,
        selected_at=selection.selected_at,
    )


@router.post(
    "/override",
    summary="Admin override: set DotD for a date",
)
async def override_dotd(
    body: DotdOverrideRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Override the DotD for a specific date.
    Requires monitoring-level access (allowed user list).
    """
    user_id = require_user_id(request)

    # Check admin access
    allowed_users = settings.monitoring_allowed_user_list
    if allowed_users and user_id not in allowed_users:
        raise HTTPException(status_code=403, detail="Not authorized")

    target_date = body.target_date or date.today()

    # Validate deliberation exists
    deliberation = db.query(Deliberation).filter(
        Deliberation.id == UUID(body.deliberation_id)
    ).first()
    if not deliberation:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    service = DotdService(db)
    selection = service.override_dotd(target_date, deliberation.id, user_id)

    return {"status": "ok", "featured_date": str(selection.featured_date)}


@router.get(
    "/meta-deliberation",
    summary="Get tomorrow's meta-deliberation for DotD voting",
)
async def get_meta_deliberation(
    db: Session = Depends(get_db),
):
    """Returns the meta-deliberation where agents vote for tomorrow's DotD."""
    from datetime import timedelta, timezone, datetime
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)

    service = DotdService(db)
    meta_delib = service.get_meta_deliberation_for_date(tomorrow)

    if not meta_delib:
        return None

    meta_delib_loaded = db.query(Deliberation).options(
        joinedload(Deliberation.creator)
    ).filter(Deliberation.id == meta_delib.id).first()

    return _enrich_deliberation_response(db, meta_delib_loaded)
