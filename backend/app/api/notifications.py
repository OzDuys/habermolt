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


def _update_profile_from_approval(db: Session, hosted_agent, question: str, opinion_text: str) -> None:
    """Extract the confirmed position from an approved opinion and append it to the profile."""
    from app.services.hosted_agent_service import get_llm_client

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="profile_update_from_approval",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    prompt = f"""The human approved the following opinion their agent submitted on their behalf.

Topic: {question}
Opinion: {opinion_text}

Extract a concise value statement (1-2 sentences) that captures this confirmed position.
Write it as a bullet point starting with "- On [topic]: ..."
Respond with ONLY the bullet point, nothing else."""

    value_statement = client.sample_text(prompt=prompt, temperature=0.2, max_tokens=150)
    if not value_statement or not value_statement.strip():
        return

    # Append to profile under a confirmed positions section
    profile = hosted_agent.user_profile or ""
    section_header = "\n\n## Confirmed Positions (approved by human)"
    if section_header.strip() not in profile:
        profile += section_header
    profile += "\n" + value_statement.strip()

    hosted_agent.user_profile = profile
    hosted_agent.profile_version += 1
    db.commit()


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


class RevertOpinionRequest(BaseModel):
    deliberation_id: str
    opinion_text: str


@router.post("/revert-opinion")
async def revert_opinion(body: RevertOpinionRequest, req: Request, db: Session = Depends(get_db)):
    """Revert an opinion to a previous version by submitting the old text as a new version."""
    user_id = require_user_id(req)

    from app.models.hosted_agent import HostedAgent
    from app.models.deliberation import Deliberation
    from app.services.continuous_deliberation_service import ContinuousDeliberationService

    hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if not hosted_agent:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    delib = db.query(Deliberation).filter(Deliberation.id == body.deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    service = ContinuousDeliberationService(db)
    try:
        service.submit_opinion(delib, hosted_agent.agent, body.opinion_text, source="revert")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"message": "Opinion reverted successfully."}


@router.post("/{notification_id}/approve")
async def approve_notification(notification_id: str, req: Request, db: Session = Depends(get_db)):
    user_id = require_user_id(req)

    # Check if already approved — prevent duplicate profile updates from double-clicks
    from app.models.notification import Notification as NotificationModel
    existing = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id, NotificationModel.user_id == user_id
    ).first()
    if existing and existing.approval_status == "approved":
        return {"status": "approved", "id": str(existing.id)}

    notification = notification_service.approve_notification(db, notification_id, user_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    # If this is an opinion-based action, extract the position and update the profile
    meta = notification.metadata_ or {}
    action_type = meta.get("action_type")
    opinion_text = meta.get("opinion_text")
    question = notification.title  # e.g. "Joined 'Should we go out drinking...'"

    if opinion_text and action_type in ("join_deliberation", "update_opinion"):
        try:
            from app.models.hosted_agent import HostedAgent
            hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
            if hosted_agent:
                _update_profile_from_approval(db, hosted_agent, question, opinion_text)
        except Exception as e:
            # Profile update failed but approval was saved — not critical
            logger.error(f"Profile update from approval failed: {e}", exc_info=True)

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
