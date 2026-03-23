"""
API routes for referral tracking.
"""

import secrets
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth import require_user_id
from app.models.referral import ReferralCode, Referral

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/referrals", tags=["referrals"])


class RecordReferralRequest(BaseModel):
    code: str


@router.get("/my-code")
def get_my_referral_code(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get (or lazily create) the current user's referral code."""
    user_id = require_user_id(request)

    existing = db.query(ReferralCode).filter(ReferralCode.user_id == user_id).first()
    if existing:
        return {"code": existing.code}

    # Generate a unique code
    for _ in range(10):
        code = secrets.token_urlsafe(8)[:10]
        if not db.query(ReferralCode).filter(ReferralCode.code == code).first():
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique referral code")

    ref_code = ReferralCode(user_id=user_id, code=code)
    db.add(ref_code)
    db.commit()

    return {"code": code}


@router.post("/record", status_code=status.HTTP_201_CREATED)
def record_referral(
    body: RecordReferralRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Record that a user signed up via a referral link."""
    user_id = require_user_id(request)

    # Look up referral code
    ref_code = db.query(ReferralCode).filter(ReferralCode.code == body.code).first()
    if not ref_code:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    # Prevent self-referral
    if ref_code.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot refer yourself")

    # Check if this user was already referred
    existing = db.query(Referral).filter(Referral.referred_user_id == user_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Referral already recorded")

    referral = Referral(
        referrer_user_id=ref_code.user_id,
        referred_user_id=user_id,
    )
    db.add(referral)
    db.commit()

    return {"message": "Referral recorded"}


@router.get("/stats")
def get_referral_stats(
    request: Request,
    db: Session = Depends(get_db),
):
    """Get referral stats for the current user."""
    user_id = require_user_id(request)

    # Get or create referral code
    ref_code = db.query(ReferralCode).filter(ReferralCode.user_id == user_id).first()
    code = None
    if ref_code:
        code = ref_code.code

    total = db.query(Referral).filter(Referral.referrer_user_id == user_id).count()

    return {
        "referral_code": code,
        "total_referrals": total,
    }


# ─── Admin / Monitoring endpoints ────────────────────────────────────────────


def _verify_monitoring(x_monitoring_secret: str = Header(...)):
    expected = settings.MONITORING_SECRET
    if not expected:
        raise HTTPException(status_code=503, detail="Monitoring not configured")
    if x_monitoring_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid monitoring secret")
    return True


class CreateReferralCodeRequest(BaseModel):
    label: str  # Friendly name like "Oscar" or "John"


@router.post("/admin/create-code")
def admin_create_referral_code(
    body: CreateReferralCodeRequest,
    db: Session = Depends(get_db),
    _auth: bool = Depends(_verify_monitoring),
):
    """Create a referral code with a label (not tied to a user account).
    Uses the label as user_id so we can attribute referrals to named connections."""
    # Check if a code already exists for this label
    existing = db.query(ReferralCode).filter(ReferralCode.user_id == f"label:{body.label}").first()
    if existing:
        return {"code": existing.code, "label": body.label, "already_existed": True}

    for _ in range(10):
        code = secrets.token_urlsafe(8)[:10]
        if not db.query(ReferralCode).filter(ReferralCode.code == code).first():
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique code")

    ref_code = ReferralCode(user_id=f"label:{body.label}", code=code)
    db.add(ref_code)
    db.commit()

    return {"code": code, "label": body.label, "already_existed": False}


@router.get("/admin/all")
def admin_list_referrals(
    db: Session = Depends(get_db),
    _auth: bool = Depends(_verify_monitoring),
):
    """List all referral codes with their conversion counts."""
    codes = db.query(ReferralCode).order_by(ReferralCode.created_at.desc()).all()

    # Fetch user names from better-auth user table
    user_ids = [rc.user_id for rc in codes if not rc.user_id.startswith("label:")]
    user_names = {}
    if user_ids:
        from sqlalchemy import text
        rows = db.execute(
            text('SELECT id, name FROM "user" WHERE id = ANY(:ids)'),
            {"ids": user_ids},
        ).fetchall()
        user_names = {r.id: r.name for r in rows}

    results = []
    for rc in codes:
        count = db.query(Referral).filter(Referral.referrer_user_id == rc.user_id).count()
        results.append({
            "id": str(rc.id),
            "user_id": rc.user_id,
            "user_name": user_names.get(rc.user_id),
            "label": rc.user_id.replace("label:", "") if rc.user_id.startswith("label:") else None,
            "code": rc.code,
            "conversions": count,
            "created_at": rc.created_at.isoformat() if rc.created_at else None,
        })

    total_conversions = db.query(Referral).count()
    return {
        "codes": results,
        "total_codes": len(results),
        "total_conversions": total_conversions,
    }
