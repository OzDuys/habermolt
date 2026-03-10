"""
API routes for deliberation chat — unified chat for deliberation participants.

Single session per agent per deliberation with phases:
browsing → joining → setup → participating.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import Agent, Deliberation
from app.models.hosted_agent import HostedAgent
from app.models.agent_session import AgentSession
from app.services import deliberation_chat_service
from app.services.hosted_agent_service import check_token_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/deliberation-chat", tags=["deliberation-chat"])


class StartChatRequest(BaseModel):
    deliberation_id: str

class ChatMessageRequest(BaseModel):
    content: str

class ChatSessionResponse(BaseModel):
    session_id: str
    deliberation_id: str
    question: str
    greeting: str
    phase: str
    history: list
    setup_progress: dict | None = None

class SessionStatusResponse(BaseModel):
    session_id: str
    phase: str
    status: str
    setup_progress: dict | None = None


def _require_user_id(req: Request) -> str:
    if settings.INTERNAL_API_SECRET:
        internal_secret = req.headers.get("X-Internal-Secret")
        if internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(status_code=401, detail="Authentication required.")
    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def _find_hosted_agent(db: Session, user_id: str) -> HostedAgent:
    hosted = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if not hosted or not hosted.agent:
        raise HTTPException(status_code=400, detail="You need a hosted agent for deliberation chat.")
    return hosted


@router.post("/start", response_model=ChatSessionResponse)
async def start_chat(
    body: StartChatRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Start or resume a deliberation chat session."""
    user_id = _require_user_id(req)
    hosted = _find_hosted_agent(db, user_id)
    agent = hosted.agent
    at_token_limit = not check_token_limit(hosted)
    if at_token_limit:
        db.commit()  # persist any un-pause state changes

    deliberation = db.query(Deliberation).filter(
        Deliberation.id == body.deliberation_id
    ).first()
    if not deliberation:
        raise HTTPException(status_code=404, detail="Deliberation not found.")

    session = deliberation_chat_service.get_or_create_session(db, hosted, deliberation)

    # Generate greeting only for new sessions (no messages yet)
    if not session.messages:
        if at_token_limit:
            # Skip LLM call — use static greeting
            phase = session.phase or "browsing"
            if phase == "participating":
                greeting = f"Hey! This deliberation is about: \"{deliberation.question}\". You've hit the weekly token limit, so I can't respond right now — but you can still browse the page."
            else:
                greeting = f"Hi! This deliberation is about: \"{deliberation.question}\". You've hit the weekly token limit, so I can't chat right now — but you can still browse the page."
        else:
            greeting = deliberation_chat_service.generate_greeting(
                db, agent, deliberation, phase=session.phase or "browsing"
            )
        session.messages = [{"role": "assistant", "content": greeting}]
        db.commit()
    else:
        greeting = session.messages[0]["content"] if session.messages else ""

    return ChatSessionResponse(
        session_id=str(session.id),
        deliberation_id=str(deliberation.id),
        question=deliberation.question,
        greeting=greeting,
        phase=session.phase or "browsing",
        history=session.messages,
        setup_progress=session.setup_progress,
    )


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Get the current status of a chat session (used for polling during setup)."""
    user_id = _require_user_id(req)
    hosted = _find_hosted_agent(db, user_id)

    session = db.query(AgentSession).filter(
        AgentSession.id == session_id,
        AgentSession.agent_id == hosted.agent_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    return SessionStatusResponse(
        session_id=str(session.id),
        phase=session.phase or "browsing",
        status=session.status,
        setup_progress=session.setup_progress,
    )


@router.post("/{session_id}/retry-setup")
async def retry_setup(
    session_id: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Retry a failed background setup."""
    user_id = _require_user_id(req)
    hosted = _find_hosted_agent(db, user_id)

    session = db.query(AgentSession).filter(
        AgentSession.id == session_id,
        AgentSession.agent_id == hosted.agent_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    progress = session.setup_progress or {}
    if not progress.get("error"):
        raise HTTPException(status_code=400, detail="No failed setup to retry.")

    deliberation_chat_service.retry_setup(db, session)
    return {"status": "retrying"}


@router.post("/{session_id}/message")
async def send_chat_message(
    session_id: str,
    body: ChatMessageRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Stream a deliberation chat response as Server-Sent Events."""
    user_id = _require_user_id(req)
    hosted = _find_hosted_agent(db, user_id)

    if not check_token_limit(hosted):
        db.commit()
        limit_msg = "You've hit the token limit for this week. Your agent can't respond until the limit resets or you upgrade."
        def limit_stream():
            yield f"data: {json.dumps({'type': 'chunk', 'content': limit_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(
            limit_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    session = db.query(AgentSession).filter(
        AgentSession.id == session_id,
        AgentSession.agent_id == hosted.agent_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    if session.phase == "setup":
        raise HTTPException(status_code=400, detail="Setup is in progress. Please wait.")

    session_id_val = session.id
    agent_id_val = hosted.agent_id
    deliberation_id_val = session.deliberation_id

    def event_stream():
        stream_db = SessionLocal()
        try:
            stream_session = stream_db.query(AgentSession).get(session_id_val)
            stream_agent = stream_db.query(Agent).get(agent_id_val)
            stream_delib = stream_db.query(Deliberation).get(deliberation_id_val)

            if not all([stream_session, stream_agent, stream_delib]):
                yield f"data: {json.dumps({'type': 'error', 'content': 'Session data not found'})}\n\n"
                return

            stream = deliberation_chat_service.stream_message(
                stream_db, stream_agent, stream_delib, stream_session, body.content
            )
            for event_type, event_data in stream:
                if event_type == "text":
                    yield f"data: {json.dumps({'type': 'chunk', 'content': event_data})}\n\n"
                elif event_type == "action_start":
                    yield f"data: {json.dumps({'type': 'action_start', 'action': event_data['action'], 'question': event_data.get('question', '')})}\n\n"
                elif event_type == "action_done":
                    yield f"data: {json.dumps({'type': 'action_done', 'action': event_data['action'], 'question': event_data.get('question', ''), 'description': event_data.get('description', ''), 'detail': event_data.get('detail', '')})}\n\n"

            # Send current phase after stream completes (may have changed due to submit_opinion)
            stream_db.refresh(stream_session)
            yield f"data: {json.dumps({'type': 'phase', 'phase': stream_session.phase or 'browsing', 'setup_progress': stream_session.setup_progress})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.error(f"Deliberation chat stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            stream_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
