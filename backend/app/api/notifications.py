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
from app.services import grounding_log_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])


def _update_profile_from_approval(
    db: Session, hosted_agent, question: str, opinion_text: str, critiques: list[str] = None,
    notification_id=None,
) -> dict | None:
    """Integrate a confirmed position into the profile by rewriting the entire profile.

    The LLM receives the current profile + new information and produces a clean,
    well-organized rewrite. Never removes existing information unless it directly
    contradicts the new human-confirmed position.
    """
    from app.services.hosted_agent_service import get_llm_client

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="profile_update_from_approval",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    current_profile = hosted_agent.user_profile or ""

    # Build the new information block
    new_info_parts = [f"Topic: {question}", f"Approved opinion: {opinion_text}"]
    if critiques:
        critique_text = "\n".join(f"  {i+1}. \"{c}\"" for i, c in enumerate(critiques))
        new_info_parts.append(f"Human critiques before approving (reveals preferences):\n{critique_text}")

    new_info = "\n".join(new_info_parts)

    prompt = f"""You are updating a user profile for an AI agent that represents this human in deliberations.

## Current Profile
{current_profile}

## New Information to Integrate
{new_info}

## Instructions
Rewrite the COMPLETE profile, integrating the new information in the appropriate place.

Rules:
1. NEVER remove existing information unless it DIRECTLY contradicts the new human-confirmed position (new info wins since it's more recent).
2. If the new info relates to an existing section or topic, update/merge it there — don't create a duplicate.
3. If the new info is on a new topic, add it under the most appropriate section.
4. Keep the profile well-organized with clear markdown headers.
5. If the human's critiques reveal how they want to be represented (tone, framing, things to avoid), capture that as a preference.
6. Keep bullet points concise (1-2 sentences each).
7. Output ONLY the complete rewritten profile — no preamble, no explanation.
8. Preserve the overall structure and voice of the existing profile."""

    rewritten = client.sample_text(prompt=prompt, temperature=0.2, max_tokens=2000)
    if not rewritten or not rewritten.strip():
        return None

    from app.services import hosted_agent_service

    version_before = hosted_agent.profile_version
    hosted_agent.user_profile = rewritten.strip()
    hosted_agent.profile_version += 1
    hosted_agent_service.record_profile_snapshot(
        db,
        hosted_agent,
        trigger="approval_rewrite",
        source_type="notification" if notification_id else None,
        source_id=notification_id,
    )
    db.commit()

    return {
        "value_statement": rewritten.strip(),
        "profile_version_before": version_before,
        "profile_version_after": hosted_agent.profile_version,
    }


def _update_profile_from_withdrawal(
    db: Session, hosted_agent, question: str, rejected_opinion_text: str,
    notification_id=None,
) -> dict | None:
    """Integrate a withdrawal into the profile as a *negative* example.

    The human looked at what their agent said in their name and pulled
    their participation entirely. That is a strong rejection signal, but
    it is also ambiguous: we don't know whether they disagreed with the
    opinion, the framing, the topic itself, or just lost interest. So
    record the *fact* of the rejection without inferring intent.
    """
    from app.services.hosted_agent_service import get_llm_client

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="profile_update_from_withdrawal",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    current_profile = hosted_agent.user_profile or ""

    new_info = (
        f"Topic: {question}\n"
        f"Position the human REJECTED strongly enough to withdraw "
        f"their participation entirely:\n"
        f"\"{rejected_opinion_text}\"\n\n"
        f"The human did NOT want their agent associated with this "
        f"position. They could have edited or revised it; instead they "
        f"pulled out. Record this as a position to avoid arguing in "
        f"future. Do NOT infer the underlying reason — multiple "
        f"interpretations are possible (disagreement with stance, with "
        f"framing, with the topic itself, or with proxy participation "
        f"on this topic at all)."
    )

    prompt = f"""You are updating a user profile for an AI agent that represents this human in deliberations.

## Current Profile
{current_profile}

## New Information to Integrate
{new_info}

## Instructions
Rewrite the COMPLETE profile, integrating the new information in the appropriate place.

Rules:
1. NEVER remove existing information unless it DIRECTLY contradicts the new human-confirmed signal.
2. The new information is a NEGATIVE example: a position the human does NOT want their agent to argue. Phrase it as an avoidance note (e.g. "Has signalled they don't want their agent arguing X on Y", or under an "Avoid" section). Do NOT phrase it as a positive belief.
3. Do NOT speculate on why the human withdrew. Record the rejection as fact only.
4. If a related topic exists in the profile, add the avoidance note alongside the relevant section.
5. Keep the profile well-organized with clear markdown headers.
6. Output ONLY the complete rewritten profile — no preamble, no explanation.
7. Preserve the overall structure and voice of the existing profile."""

    rewritten = client.sample_text(prompt=prompt, temperature=0.2, max_tokens=2000)
    if not rewritten or not rewritten.strip():
        return None

    from app.services import hosted_agent_service

    version_before = hosted_agent.profile_version
    hosted_agent.user_profile = rewritten.strip()
    hosted_agent.profile_version += 1
    hosted_agent_service.record_profile_snapshot(
        db,
        hosted_agent,
        trigger="withdrawal_rewrite",
        source_type="notification" if notification_id else None,
        source_id=notification_id,
    )
    db.commit()

    return {
        "value_statement": rewritten.strip(),
        "profile_version_before": version_before,
        "profile_version_after": hosted_agent.profile_version,
    }


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

    # Log the approval
    from app.models.agent import Agent
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    grounding_log_service.log_event(
        db, user_id, "approve",
        agent_id=agent.id if agent else None,
        notification_id=notification.id,
        deliberation_id=meta.get("deliberation_id"),
        opinion_text_before=opinion_text,
        opinion_text_after=opinion_text,
        metadata={"action_type": action_type},
    )

    if opinion_text and action_type in ("join_deliberation", "update_opinion"):
        try:
            from app.models.hosted_agent import HostedAgent
            hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
            if hosted_agent:
                profile_result = _update_profile_from_approval(
                    db, hosted_agent, question, opinion_text, notification_id=notification.id,
                )
                if profile_result:
                    grounding_log_service.log_event(
                        db, user_id, "profile_updated",
                        agent_id=agent.id if agent else None,
                        hosted_agent_id=hosted_agent.id,
                        notification_id=notification.id,
                        deliberation_id=meta.get("deliberation_id"),
                        output_text=profile_result["value_statement"],
                        profile_version_before=profile_result["profile_version_before"],
                        profile_version_after=profile_result["profile_version_after"],
                        metadata={"trigger": "approval"},
                    )
        except Exception as e:
            logger.error(f"Profile update from approval failed: {e}", exc_info=True)

    db.commit()
    return {"status": "approved", "id": str(notification.id)}


@router.post("/{notification_id}/disapprove")
async def disapprove_notification(
    notification_id: str, body: DisapproveRequest, req: Request, db: Session = Depends(get_db)
):
    user_id = require_user_id(req)
    notification = notification_service.disapprove_notification(db, notification_id, user_id, body.reason)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    meta = notification.metadata_ or {}
    from app.models.agent import Agent
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()

    grounding_log_service.log_event(
        db, user_id, "disapprove",
        agent_id=agent.id if agent else None,
        notification_id=notification.id,
        deliberation_id=meta.get("deliberation_id"),
        input_text=body.reason,
        opinion_text_before=meta.get("opinion_text"),
        metadata={"action_type": meta.get("action_type")},
    )
    db.commit()

    return {"status": "disapproved", "id": str(notification.id)}


class ReviseOpinionRequest(BaseModel):
    critique: str
    current_opinion: str


@router.post("/{notification_id}/revise-opinion")
async def revise_opinion(
    notification_id: str, body: ReviseOpinionRequest, req: Request, db: Session = Depends(get_db)
):
    """Generate a revised opinion based on user critique. Does NOT save — returns draft for review."""
    user_id = require_user_id(req)

    from app.models.notification import Notification as NotificationModel
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id, NotificationModel.user_id == user_id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Only works for hosted agents
    from app.models.hosted_agent import HostedAgent
    hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if not hosted_agent:
        raise HTTPException(status_code=400, detail="Inline revision only available for hosted agents")

    from app.services.hosted_agent_service import get_llm_client, check_token_limit
    if not check_token_limit(hosted_agent):
        raise HTTPException(status_code=429, detail="Token limit reached")

    meta = notification.metadata_ or {}
    question = notification.title  # e.g. "Joined 'Should AI be regulated?'"

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="opinion_revision",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    profile = hosted_agent.user_profile or ""

    prompt = f"""You are revising an opinion that was submitted on behalf of a human in a deliberation.

## The Human's Profile
{profile}

## Deliberation Topic
{question}

## Current Opinion
{body.current_opinion}

## Human's Critique
{body.critique}

Write a revised opinion that addresses the critique while still representing this person's values and perspective.
Write ONLY the revised opinion text, nothing else. No preamble, no "Here's the revised opinion:", just the opinion itself.
Keep it concise (2-4 sentences)."""

    try:
        revised = client.sample_text(prompt=prompt, temperature=0.4, max_tokens=500)
    except Exception as e:
        logger.error(f"LLM call failed for opinion revision: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate revised opinion")

    if not revised or not revised.strip():
        raise HTTPException(status_code=500, detail="Failed to generate revised opinion")

    # Track tokens
    from app.services.hosted_agent_service import track_untracked_tokens
    track_untracked_tokens(db, hosted_agent)

    revised_text = revised.strip()

    # Log the critique and the revision
    grounding_log_service.log_event(
        db, user_id, "critique",
        agent_id=hosted_agent.agent_id,
        hosted_agent_id=hosted_agent.id,
        notification_id=notification.id,
        deliberation_id=meta.get("deliberation_id"),
        input_text=body.critique,
        opinion_text_before=body.current_opinion,
    )
    grounding_log_service.log_event(
        db, user_id, "revision_generated",
        agent_id=hosted_agent.agent_id,
        hosted_agent_id=hosted_agent.id,
        notification_id=notification.id,
        deliberation_id=meta.get("deliberation_id"),
        input_text=body.critique,
        output_text=revised_text,
        opinion_text_before=body.current_opinion,
        opinion_text_after=revised_text,
    )
    db.commit()

    return {"revised_opinion": revised_text}


class WithdrawRequest(BaseModel):
    deliberation_id: str


@router.post("/{notification_id}/withdraw")
async def withdraw_from_deliberation(
    notification_id: str, body: WithdrawRequest, req: Request, db: Session = Depends(get_db)
):
    """Withdraw the agent from a deliberation: remove opinion, ranking, anonymize statements, recalculate Schulze."""
    user_id = require_user_id(req)

    from app.models.notification import Notification as NotificationModel
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id, NotificationModel.user_id == user_id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    from app.models.agent import Agent
    from app.models.hosted_agent import HostedAgent
    from app.models.deliberation import Deliberation
    from app.models.opinion import Opinion
    from app.models.ranking import Ranking
    from app.models.statement import Statement
    from app.services.schulze_service import SchulzeService

    # Find the agent
    agent = None
    hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted_agent:
        agent = hosted_agent.agent
    else:
        agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="No agent found")

    delib = db.query(Deliberation).filter(Deliberation.id == body.deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    # 1. Delete all opinion versions for this agent in this deliberation
    db.query(Opinion).filter(
        Opinion.deliberation_id == delib.id,
        Opinion.agent_id == agent.id,
    ).delete()

    # 2. Delete rankings
    db.query(Ranking).filter(
        Ranking.deliberation_id == delib.id,
        Ranking.agent_id == agent.id,
    ).delete()

    # 3. Anonymize proposed statements (keep them, just remove attribution)
    db.query(Statement).filter(
        Statement.deliberation_id == delib.id,
        Statement.contributed_by_agent_id == agent.id,
    ).update({"contributed_by_agent_id": None})

    # 4. Decrement participant count
    if delib.num_citizens and delib.num_citizens > 0:
        delib.num_citizens -= 1

    db.flush()

    # 5. Recalculate Schulze rankings
    try:
        schulze = SchulzeService()
        schulze.aggregate_from_db(db, str(delib.id))
    except Exception as e:
        logger.warning(f"Schulze recalculation after withdrawal failed: {e}")

    # 6. Mark notification as withdrawn
    notification.approval_status = "withdrawn"
    from datetime import datetime
    notification.read = True
    notification.read_at = datetime.utcnow()

    # 7. Create a withdrawal record notification (used by agent-status to prevent re-discovery)
    notification_service.create_notification(
        db, user_id,
        type="agent_action",
        title=f"Withdrew from '{delib.question}'",
        body="You withdrew from this deliberation.",
        metadata={
            "action_type": "withdrawal",
            "deliberation_id": str(delib.id),
        },
    )

    # Log the withdrawal
    opinions_deleted = db.query(Opinion).filter(
        Opinion.deliberation_id == delib.id, Opinion.agent_id == agent.id,
    ).count()  # already deleted above, so this will be 0 — count before delete was not captured
    grounding_log_service.log_event(
        db, user_id, "withdraw",
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id if hosted_agent else None,
        notification_id=notification.id,
        deliberation_id=delib.id,
        opinion_text_before=(notification.metadata_ or {}).get("opinion_text"),
        metadata={
            "deliberation_question": delib.question,
        },
    )

    # Learn from the withdrawal: the user looked at the agent's stated
    # opinion and pulled their participation entirely. Record this as a
    # negative example in the profile (only for hosted-agent users since
    # OpenClaw users have no profile to update).
    if hosted_agent:
        rejected_opinion_text = (notification.metadata_ or {}).get("opinion_text") or ""
        if rejected_opinion_text:
            try:
                profile_result = _update_profile_from_withdrawal(
                    db, hosted_agent, delib.question, rejected_opinion_text,
                    notification_id=notification.id,
                )
                if profile_result:
                    grounding_log_service.log_event(
                        db, user_id, "profile_updated",
                        agent_id=agent.id,
                        hosted_agent_id=hosted_agent.id,
                        notification_id=notification.id,
                        deliberation_id=delib.id,
                        output_text=profile_result["value_statement"],
                        profile_version_before=profile_result["profile_version_before"],
                        profile_version_after=profile_result["profile_version_after"],
                        metadata={"trigger": "withdrawal"},
                    )
            except Exception as e:
                logger.error(f"Profile update from withdrawal failed: {e}", exc_info=True)

    db.commit()

    return {"status": "withdrawn", "deliberation_id": str(delib.id)}


class SaveOpinionRequest(BaseModel):
    opinion_text: str
    deliberation_id: str
    critiques: list[str] = []


@router.post("/{notification_id}/save-opinion")
async def save_revised_opinion(
    notification_id: str, body: SaveOpinionRequest, req: Request, db: Session = Depends(get_db)
):
    """Save a revised or manually edited opinion and approve the notification."""
    user_id = require_user_id(req)

    from app.models.notification import Notification as NotificationModel
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id, NotificationModel.user_id == user_id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Find the agent (hosted or OpenClaw)
    from app.models.agent import Agent
    from app.models.hosted_agent import HostedAgent
    from app.models.deliberation import Deliberation
    from app.services.continuous_deliberation_service import ContinuousDeliberationService

    agent = None
    hosted_agent = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted_agent:
        agent = hosted_agent.agent
    else:
        agent = db.query(Agent).filter(Agent.user_id == user_id).first()

    if not agent:
        raise HTTPException(status_code=404, detail="No agent found")

    delib = db.query(Deliberation).filter(Deliberation.id == body.deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    # Submit the revised opinion
    service = ContinuousDeliberationService(db)
    try:
        service.submit_opinion(delib, agent, body.opinion_text, source="human_edit")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Mark notification as approved with the new opinion text
    notification.approval_status = "approved"
    notification.read = True
    from datetime import datetime
    notification.read_at = datetime.utcnow()
    # Update metadata to reflect the final opinion
    meta = notification.metadata_ or {}
    meta["opinion_text"] = body.opinion_text
    meta["revised"] = True
    notification.metadata_ = meta
    db.commit()

    # Log the save event
    original_opinion = (notification.metadata_ or {}).get("opinion_text", "")
    grounding_log_service.log_event(
        db, user_id, "save",
        agent_id=agent.id,
        hosted_agent_id=hosted_agent.id if hosted_agent else None,
        notification_id=notification.id,
        deliberation_id=delib.id,
        opinion_text_before=original_opinion,
        opinion_text_after=body.opinion_text,
        metadata={
            "source": "revision" if body.critiques else "human_edit",
            "total_critiques": len(body.critiques),
            "all_critiques": body.critiques,
        },
    )

    # Update profile with confirmed position
    if hosted_agent:
        try:
            profile_result = _update_profile_from_approval(
                db, hosted_agent, notification.title, body.opinion_text,
                critiques=body.critiques if body.critiques else None,
                notification_id=notification.id,
            )
            if profile_result:
                grounding_log_service.log_event(
                    db, user_id, "profile_updated",
                    agent_id=agent.id,
                    hosted_agent_id=hosted_agent.id,
                    notification_id=notification.id,
                    deliberation_id=delib.id,
                    output_text=profile_result["value_statement"],
                    profile_version_before=profile_result["profile_version_before"],
                    profile_version_after=profile_result["profile_version_after"],
                    metadata={
                        "trigger": "save_with_critiques" if body.critiques else "save_edit",
                        "total_critiques": len(body.critiques),
                    },
                )
        except Exception as e:
            logger.error(f"Profile update from save-opinion failed: {e}", exc_info=True)

    db.commit()
    return {"status": "approved", "id": str(notification.id), "opinion_text": body.opinion_text}
