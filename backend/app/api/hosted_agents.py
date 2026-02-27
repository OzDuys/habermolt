"""
API routes for hosted agent management and chat.
"""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Deliberation
from app.services import hosted_agent_service, notification_service
from app.services import chat_service
from app.services.hosted_agent_runner import run_all_hosted_agents

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hosted-agents", tags=["hosted-agents"])


# --- Request/Response schemas ---

class CreateHostedAgentRequest(BaseModel):
    display_name: str
    pricing_tier: str = "free"
    byok_api_key: Optional[str] = None
    model: Optional[str] = None
    selected_deliberation_ids: list[str] = []

class UpdateHostedAgentRequest(BaseModel):
    display_name: Optional[str] = None
    model: Optional[str] = None
    participation_frequency: Optional[str] = None
    is_active: Optional[bool] = None

class ChatMessageRequest(BaseModel):
    content: str

class ByokKeyRequest(BaseModel):
    api_key: str

class HostedAgentResponse(BaseModel):
    id: str
    display_name: str
    model: str
    participation_frequency: str
    pricing_tier: str
    is_active: bool
    paused_reason: Optional[str]
    has_profile: bool
    profile_version: int
    tokens_used_period: int
    token_limit: Optional[int]
    last_heartbeat_at: Optional[str]
    created_at: str

class ChatSessionResponse(BaseModel):
    id: str
    topic: Optional[str]
    messages: list
    created_at: str

class ChatMessageResponse(BaseModel):
    assistant_message: str

class ProfileUpdateRequest(BaseModel):
    profile_markdown: str

class ChatSessionSummary(BaseModel):
    id: str
    topic: Optional[str]
    message_count: int
    created_at: str


# --- Auth helper (same pattern as agents.py) ---

def _require_user_id(req: Request) -> str:
    if settings.INTERNAL_API_SECRET:
        internal_secret = req.headers.get("X-Internal-Secret")
        if internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(status_code=401, detail="Authentication required.")
    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def _require_cron_secret(req: Request) -> None:
    secret = req.headers.get("X-Cron-Secret")
    if not settings.CRON_SECRET or secret != settings.CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid cron secret.")


TOKEN_LIMITS = {
    "free": settings.HOSTED_AGENT_FREE_TOKEN_LIMIT,
    "subscription": settings.HOSTED_AGENT_SUBSCRIPTION_TOKEN_LIMIT,
    "byok": None,
}


def _to_response(ha) -> HostedAgentResponse:
    return HostedAgentResponse(
        id=str(ha.id),
        display_name=ha.display_name,
        model=ha.model,
        participation_frequency=ha.participation_frequency,
        pricing_tier=ha.pricing_tier,
        is_active=ha.is_active,
        paused_reason=ha.paused_reason,
        has_profile=ha.user_profile is not None,
        profile_version=ha.profile_version,
        tokens_used_period=ha.tokens_used_period,
        token_limit=TOKEN_LIMITS.get(ha.pricing_tier),
        last_heartbeat_at=ha.last_heartbeat_at.isoformat() if ha.last_heartbeat_at else None,
        created_at=ha.created_at.isoformat(),
    )


# --- Endpoints ---

@router.post("", status_code=201)
async def create_hosted_agent(
    body: CreateHostedAgentRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    try:
        ha = hosted_agent_service.create_hosted_agent(
            db, user_id, body.display_name, body.pricing_tier, body.byok_api_key, body.model
        )

        # If user selected deliberations, create first chat session grounded in those topics
        if body.selected_deliberation_ids:
            delibs = db.query(Deliberation).filter(
                Deliberation.id.in_(body.selected_deliberation_ids)
            ).all()
            if delibs:
                topic_text = "\n".join(f"- {d.question}" for d in delibs)
                session = chat_service.get_or_create_session(db, ha, topic=topic_text)
                chat_service.get_initial_greeting(db, ha, session)

        return _to_response(ha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/me")
async def get_my_hosted_agent(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    return _to_response(ha)


@router.patch("/me")
async def update_my_hosted_agent(
    body: UpdateHostedAgentRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    try:
        ha = hosted_agent_service.update_hosted_agent(
            db, ha, body.display_name, body.model, body.participation_frequency, body.is_active
        )
        return _to_response(ha)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me", status_code=204)
async def delete_my_hosted_agent(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    hosted_agent_service.delete_hosted_agent(db, ha)


@router.post("/me/byok-key", status_code=200)
async def set_byok_key(body: ByokKeyRequest, req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    try:
        hosted_agent_service.set_byok_key(db, ha, body.api_key)
        return {"message": "BYOK key set. Tier upgraded to BYOK."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me/byok-key", status_code=200)
async def remove_byok_key(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    hosted_agent_service.remove_byok_key(db, ha)
    return {"message": "BYOK key removed. Reverted to free tier."}


# --- Chat ---

@router.get("/me/chat")
async def get_chat(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    session = chat_service.get_current_session(db, ha)
    if not session:
        session = chat_service.get_or_create_session(db, ha)
        chat_service.get_initial_greeting(db, ha, session)

    return ChatSessionResponse(
        id=str(session.id),
        topic=session.topic,
        messages=session.messages or [],
        created_at=session.created_at.isoformat(),
    )


@router.post("/me/chat/message")
async def send_chat_message(
    body: ChatMessageRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    session = chat_service.get_or_create_session(db, ha)
    response_text = chat_service.add_user_message(db, ha, session, body.content)

    return ChatMessageResponse(
        assistant_message=response_text,
    )


@router.post("/me/chat/stream")
async def stream_chat_message(
    body: ChatMessageRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Stream a chat response as Server-Sent Events."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    session = chat_service.get_or_create_session(db, ha)

    def event_stream():
        for chunk in chat_service.stream_user_message(db, ha, session, body.content):
            # Don't stream the PROFILE_UPDATE section to the client
            if "PROFILE_UPDATE:" in chunk:
                clean_part = chunk[:chunk.index("PROFILE_UPDATE:")].rstrip()
                if clean_part:
                    yield f"data: {json.dumps({'type': 'chunk', 'content': clean_part})}\n\n"
                break
            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- Profile ---

@router.get("/me/profile")
async def get_profile(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    return {
        "profile_markdown": ha.user_profile or "",
        "profile_version": ha.profile_version,
    }


@router.put("/me/profile")
async def update_profile(body: ProfileUpdateRequest, req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    ha.user_profile = body.profile_markdown
    ha.profile_version += 1
    db.commit()
    return {
        "profile_markdown": ha.user_profile,
        "profile_version": ha.profile_version,
    }


# --- Chat history ---

@router.get("/me/chat/history")
async def list_chat_sessions(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    sessions = chat_service.get_all_sessions(db, ha)
    return [
        ChatSessionSummary(
            id=str(s.id),
            topic=s.topic,
            message_count=len(s.messages or []),
            created_at=s.created_at.isoformat(),
        )
        for s in sessions
    ]


# --- Cron heartbeat ---

@router.post("/heartbeat-all")
async def heartbeat_all(req: Request, db: Session = Depends(get_db)):
    _require_cron_secret(req)
    results = run_all_hosted_agents(db)
    return results
