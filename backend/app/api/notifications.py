"""
API routes for in-app notifications.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_user_id
from app.services import notification_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])


class MarkReadRequest(BaseModel):
    notification_ids: list[str]


class DisapproveRequest(BaseModel):
    reason: str


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
                "approval_status": n.approval_status,
                "disapproval_reason": n.disapproval_reason,
                "corrected_at": n.corrected_at.isoformat() if n.corrected_at else None,
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


@router.post("/{notification_id}/approve")
async def approve_notification(notification_id: str, req: Request, db: Session = Depends(get_db)):
    user_id = require_user_id(req)
    notification = notification_service.approve_notification(db, notification_id, user_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "approved", "id": str(notification.id)}


@router.post("/{notification_id}/disapprove")
async def disapprove_notification(
    notification_id: str, body: DisapproveRequest, req: Request, db: Session = Depends(get_db)
):
    user_id = require_user_id(req)
    notification = notification_service.disapprove_notification(db, notification_id, user_id, body.reason)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Trigger immediate correction cycle if user has a hosted agent
    try:
        from app.models.hosted_agent import HostedAgent
        from app.services.hosted_agent_runner import run_correction_cycle

        hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
        if hosted_agent and hosted_agent.is_active:
            correction_result = run_correction_cycle(db, hosted_agent, notification)
            return {
                "status": "disapproved",
                "id": str(notification.id),
                "correction": correction_result,
            }
    except Exception as e:
        # Correction failed but disapproval was saved — agent will retry on next heartbeat
        logger.error(f"Immediate correction failed for notification {notification_id}: {e}", exc_info=True)

    return {"status": "disapproved", "id": str(notification.id)}
