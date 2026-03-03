"""
API routes for topic interviews — focused deliberation-specific interviews
that work with any agent type (hosted or OpenClaw).
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.config import settings
from app.database import get_db, SessionLocal
from app.models import Agent, Deliberation
from app.models.hosted_agent import HostedAgent
from app.models.deliberation_member import DeliberationMember
from app.models.agent_session import AgentSession
from app.services import topic_interview_service, hosted_agent_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/topic-interview", tags=["topic-interview"])


# --- Request/Response schemas ---

class StartInterviewRequest(BaseModel):
    deliberation_id: str

class JoinAndStartRequest(BaseModel):
    invite_code: str

class InterviewMessageRequest(BaseModel):
    content: str

class InterviewSessionResponse(BaseModel):
    session_id: str
    deliberation_id: str
    question: str
    greeting: str
    status: str

class InterviewStatusResponse(BaseModel):
    session_id: str
    status: str
    deliberation_id: str


# --- Auth helper ---

def _require_user_id(req: Request) -> str:
    if settings.INTERNAL_API_SECRET:
        internal_secret = req.headers.get("X-Internal-Secret")
        if internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(status_code=401, detail="Authentication required.")
    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def _find_user_agent(db: Session, user_id: str) -> Optional[Agent]:
    """Find the user's agent — either a HostedAgent's shadow agent or a claimed OpenClaw agent."""
    hosted = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if hosted and hosted.agent:
        return hosted.agent
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    return agent


# --- Endpoints ---

@router.post("/start", response_model=InterviewSessionResponse)
async def start_interview(
    body: StartInterviewRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Start a topic interview for a deliberation. Creates a session and generates a greeting."""
    user_id = _require_user_id(req)

    agent = _find_user_agent(db, user_id)
    if not agent:
        raise HTTPException(status_code=400, detail="You need an agent to start an interview.")

    deliberation = db.query(Deliberation).filter(
        Deliberation.id == body.deliberation_id
    ).first()
    if not deliberation:
        raise HTTPException(status_code=404, detail="Deliberation not found.")

    # Check if there's already an active session for this agent + deliberation
    existing = db.query(AgentSession).filter(
        and_(
            AgentSession.agent_id == agent.id,
            AgentSession.deliberation_id == deliberation.id,
            AgentSession.session_type == "deliberation_join",
            AgentSession.status == "active",
        )
    ).first()
    if existing:
        return InterviewSessionResponse(
            session_id=str(existing.id),
            deliberation_id=str(deliberation.id),
            question=deliberation.question,
            greeting=existing.messages[0]["content"] if existing.messages else "",
            status=existing.status,
        )

    session = topic_interview_service.create_session(db, agent, deliberation, user_id)
    greeting = topic_interview_service.generate_greeting(db, agent, deliberation, session)

    return InterviewSessionResponse(
        session_id=str(session.id),
        deliberation_id=str(deliberation.id),
        question=deliberation.question,
        greeting=greeting,
        status=session.status,
    )


@router.post("/join-and-start", response_model=InterviewSessionResponse)
async def join_and_start_interview(
    body: JoinAndStartRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Join a private deliberation via invite code and start a topic interview.
    Auto-creates a default haberagent if the user has no agent."""
    user_id = _require_user_id(req)

    # Find the deliberation by invite code
    deliberation = db.query(Deliberation).filter(
        Deliberation.invite_code == body.invite_code
    ).first()
    if not deliberation:
        raise HTTPException(status_code=404, detail="Invalid invite code.")

    # Find or create the user's agent
    agent = _find_user_agent(db, user_id)
    if not agent:
        # Auto-create a default haberagent
        try:
            ha = hosted_agent_service.create_hosted_agent(
                db, user_id, display_name="My Agent", pricing_tier="free"
            )
            agent = ha.agent
        except ValueError:
            raise HTTPException(status_code=400, detail="Could not create agent.")

    # Join the deliberation if private and not already a member
    if deliberation.is_private:
        existing_member = db.query(DeliberationMember).filter(
            and_(
                DeliberationMember.deliberation_id == deliberation.id,
                DeliberationMember.agent_id == agent.id,
            )
        ).first()
        if not existing_member:
            member = DeliberationMember(
                deliberation_id=deliberation.id,
                agent_id=agent.id,
                joined_by_user_id=user_id,
            )
            db.add(member)
            db.commit()

    # Check if there's already an active session
    existing_session = db.query(AgentSession).filter(
        and_(
            AgentSession.agent_id == agent.id,
            AgentSession.deliberation_id == deliberation.id,
            AgentSession.session_type == "deliberation_join",
            AgentSession.status == "active",
        )
    ).first()
    if existing_session:
        return InterviewSessionResponse(
            session_id=str(existing_session.id),
            deliberation_id=str(deliberation.id),
            question=deliberation.question,
            greeting=existing_session.messages[0]["content"] if existing_session.messages else "",
            status=existing_session.status,
        )

    session = topic_interview_service.create_session(db, agent, deliberation, user_id)
    greeting = topic_interview_service.generate_greeting(db, agent, deliberation, session)

    return InterviewSessionResponse(
        session_id=str(session.id),
        deliberation_id=str(deliberation.id),
        question=deliberation.question,
        greeting=greeting,
        status=session.status,
    )


@router.post("/{session_id}/message")
async def send_interview_message(
    session_id: str,
    body: InterviewMessageRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Stream a topic interview message response as Server-Sent Events."""
    user_id = _require_user_id(req)

    # Capture IDs before the request-scoped db closes
    session = topic_interview_service.get_session(db, session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    if session.status == "completed":
        raise HTTPException(status_code=400, detail="This interview is already completed.")

    session_id_val = session.id
    agent_id_val = session.agent_id
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

            stream = topic_interview_service.stream_message(
                stream_db, stream_agent, stream_delib, stream_session, body.content
            )
            for event_type, event_data in stream:
                if event_type == "text":
                    yield f"data: {json.dumps({'type': 'chunk', 'content': event_data})}\n\n"
                elif event_type == "action_start":
                    yield f"data: {json.dumps({'type': 'action_start', 'action': event_data['action'], 'question': event_data.get('question', '')})}\n\n"
                elif event_type == "action_done":
                    yield f"data: {json.dumps({'type': 'action_done', 'action': event_data['action'], 'question': event_data.get('question', ''), 'description': event_data.get('description', ''), 'detail': event_data.get('detail', '')})}\n\n"

            # Check if session completed
            stream_db.refresh(stream_session)
            yield f"data: {json.dumps({'type': 'status', 'status': stream_session.status})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            logger.error(f"Topic interview stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            stream_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{session_id}/status", response_model=InterviewStatusResponse)
async def get_interview_status(
    session_id: str,
    req: Request,
    db: Session = Depends(get_db),
):
    """Get the current status of an interview session."""
    user_id = _require_user_id(req)

    session = topic_interview_service.get_session(db, session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    return InterviewStatusResponse(
        session_id=str(session.id),
        status=session.status,
        deliberation_id=str(session.deliberation_id),
    )
