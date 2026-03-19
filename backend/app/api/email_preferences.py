"""
API routes for email preferences and transactional email triggers.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_user_id
from app.models.email_preference import EmailPreference
from app.services import email_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["email"])


# --- Schemas ---

class EmailPreferenceResponse(BaseModel):
    weekly_summary: bool
    marketing: bool

class UpdateEmailPreferenceRequest(BaseModel):
    weekly_summary: Optional[bool] = None
    marketing: Optional[bool] = None


# --- Authenticated preference endpoints (for Settings page) ---

@router.get("/preferences/me", response_model=EmailPreferenceResponse)
async def get_my_preferences(req: Request, db: Session = Depends(get_db)):
    """Get current user's email preferences."""
    user_id = require_user_id(req)
    pref = email_service.get_or_create_email_preference(db, user_id)
    db.commit()
    return EmailPreferenceResponse(
        weekly_summary=pref.weekly_summary,
        marketing=pref.marketing,
    )


@router.post("/preferences/me", response_model=EmailPreferenceResponse)
async def update_my_preferences(
    body: UpdateEmailPreferenceRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Update current user's email preferences."""
    user_id = require_user_id(req)
    pref = email_service.get_or_create_email_preference(db, user_id)
    if body.weekly_summary is not None:
        pref.weekly_summary = body.weekly_summary
    if body.marketing is not None:
        pref.marketing = body.marketing
    db.commit()
    return EmailPreferenceResponse(
        weekly_summary=pref.weekly_summary,
        marketing=pref.marketing,
    )


# --- Token-based endpoints (for unsubscribe page, no auth) ---

@router.get("/preferences/by-token/{token}", response_model=EmailPreferenceResponse)
async def get_preferences_by_token(token: str, db: Session = Depends(get_db)):
    """Get email preferences by unsubscribe token (no auth)."""
    pref = db.query(EmailPreference).filter(
        EmailPreference.unsubscribe_token == token
    ).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Invalid token")
    return EmailPreferenceResponse(
        weekly_summary=pref.weekly_summary,
        marketing=pref.marketing,
    )


@router.post("/preferences/by-token/{token}", response_model=EmailPreferenceResponse)
async def update_preferences_by_token(
    token: str,
    body: UpdateEmailPreferenceRequest,
    db: Session = Depends(get_db),
):
    """Update email preferences by unsubscribe token (no auth)."""
    pref = db.query(EmailPreference).filter(
        EmailPreference.unsubscribe_token == token
    ).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Invalid token")
    if body.weekly_summary is not None:
        pref.weekly_summary = body.weekly_summary
    if body.marketing is not None:
        pref.marketing = body.marketing
    db.commit()
    return EmailPreferenceResponse(
        weekly_summary=pref.weekly_summary,
        marketing=pref.marketing,
    )
