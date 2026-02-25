"""
API routes for waitlist email collection.
"""

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.waitlist import WaitlistEmail

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/waitlist", tags=["waitlist"])


class WaitlistEmailRequest(BaseModel):
    email: EmailStr


class WaitlistEmailResponse(BaseModel):
    message: str


@router.post(
    "/email",
    response_model=WaitlistEmailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Join the waitlist",
)
@limiter.limit("5/minute")
async def submit_waitlist_email(
    body: WaitlistEmailRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Silently ignore duplicates
    existing = db.query(WaitlistEmail).filter(WaitlistEmail.email == body.email).first()
    if not existing:
        entry = WaitlistEmail(email=body.email)
        db.add(entry)
        db.commit()

    return WaitlistEmailResponse(message="You're on the list!")
