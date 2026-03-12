"""
API routes for in-app notifications.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_user_id
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_ids: list[str]




@router.get("")
async def list_notifications(
    req: Request,
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    user_id = require_user_id(req)
    items, total = notification_service.get_notifications(db, user_id, unread_only, limit, offset)
    return {
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "read": n.read,
                "metadata": n.metadata_,
                "created_at": n.created_at.isoformat(),
                "read_at": n.read_at.isoformat() if n.read_at else None,
            }
            for n in items
        ],
        "total": total,
    }


@router.get("/unread-count")
async def unread_count(req: Request, db: Session = Depends(get_db)):
    user_id = require_user_id(req)
    count = notification_service.get_unread_count(db, user_id)
    return {"count": count}


@router.post("/mark-read")
async def mark_read(body: MarkReadRequest, req: Request, db: Session = Depends(get_db)):
    user_id = require_user_id(req)
    count = notification_service.mark_read(db, body.notification_ids, user_id)
    return {"marked": count}


@router.post("/mark-all-read")
async def mark_all_read(req: Request, db: Session = Depends(get_db)):
    user_id = require_user_id(req)
    count = notification_service.mark_all_read(db, user_id)
    return {"marked": count}
