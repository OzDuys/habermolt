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
from app.database import get_db, SessionLocal
from app.models import Deliberation
from app.models.hosted_agent import HostedAgent
from app.services import hosted_agent_service, notification_service
from app.services import chat_service
from app.services.llm_client import LLMClient
from app.services.hosted_agent_runner import run_all_hosted_agents, run_single_hosted_agent, run_single_hosted_agent_stream

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
    session_id: Optional[str] = None

class ByokKeyRequest(BaseModel):
    api_key: str

class HostedAgentResponse(BaseModel):
    id: str
    agent_id: str
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

class RerankRequest(BaseModel):
    rankings: list  # [{statement_id, rank}]

class RebuildProfileRequest(BaseModel):
    session_ids: list[str] = []  # empty = all sessions

class DownloadSessionsRequest(BaseModel):
    session_ids: list[str]


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
        agent_id=str(ha.agent_id),
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

@router.get("/taken-names")
async def get_taken_names(db: Session = Depends(get_db)):
    """Return list of display names already in use by hosted agents."""
    names = db.query(HostedAgent.display_name).all()
    return [n[0] for n in names]


@router.get("/generate-names")
async def generate_names(db: Session = Depends(get_db)):
    """Generate fresh lobster agent names via LLM, excluding taken ones."""
    taken = {n[0].lower() for n in db.query(HostedAgent.display_name).all()}

    client = LLMClient()
    prompt = (
        "Generate 8 fun, creative names for a lobster AI agent. "
        "The names should be lobster/crustacean themed puns, wordplay, or playful titles. "
        "Mix styles: some punny (like 'Clawdia', 'Pinchy McDebate'), some regal "
        "(like 'The Crimson Counsel'), some quirky (like 'Snappy Verdict').\n\n"
    )
    if taken:
        prompt += f"These names are already taken, do NOT suggest them: {', '.join(taken)}\n\n"
    prompt += "Return ONLY the names, one per line. No numbering, no explanations."

    result = client.sample_text(prompt=prompt, temperature=0.9, max_tokens=256)
    names = [
        line.strip().strip("-•").strip()
        for line in result.strip().splitlines()
        if line.strip() and line.strip().lower() not in taken
    ]
    return names[:8]


class SeedQuestionsRequest(BaseModel):
    deliberation_ids: list[str]


@router.post("/seed-questions")
async def generate_seed_questions(
    body: SeedQuestionsRequest,
    db: Session = Depends(get_db),
):
    """Generate 3 seed value-mapping questions tailored to the user's selected deliberation topics."""
    if not body.deliberation_ids:
        raise HTTPException(status_code=400, detail="No deliberation IDs provided")

    delibs = db.query(Deliberation).filter(
        Deliberation.id.in_(body.deliberation_ids)
    ).all()
    if not delibs:
        raise HTTPException(status_code=404, detail="No deliberations found")

    topics = "\n".join(f"- {d.question}" for d in delibs)

    client = LLMClient()
    prompt = f"""The user has selected these deliberation topics they care about:

{topics}

Generate exactly 3 quick multiple-choice questions that will help an AI agent understand the user's values and positions relevant to these topics. Each question should:
- Be a short, conversational "are you more X or Y?" style question
- Have exactly 3 choices
- Each choice maps to a value statement (a markdown bullet point starting with "- ")
- Have a brief subtext explaining why this question matters

Also write a 1-2 sentence summary of what kinds of topics and themes this person is interested in, based on the deliberations they chose.

Return valid JSON only, no markdown fences. Format:
{{
  "interests_summary": "A short summary of the user's interests based on their selected topics.",
  "questions": [
    {{
      "id": "short_id",
      "prompt": "The question text",
      "subtext": "Why this helps",
      "choices": [
        {{"label": "Short choice label", "valueStatement": "- Full value statement for the agent's profile"}},
        {{"label": "Short choice label", "valueStatement": "- Full value statement for the agent's profile"}},
        {{"label": "Short choice label", "valueStatement": "- Full value statement for the agent's profile"}}
      ]
    }}
  ]
}}"""

    result = client.sample_text(prompt=prompt, temperature=0.7, max_tokens=1500)

    # Parse JSON from response (strip markdown fences if present)
    text = result.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse generated questions")

    # Handle both formats: wrapper object or bare array
    if isinstance(parsed, list):
        questions = parsed
        interests_summary = ""
    else:
        questions = parsed.get("questions", [])
        interests_summary = parsed.get("interests_summary", "")

    return {"questions": questions[:3], "interests_summary": interests_summary}


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


@router.post("/create-default", status_code=201)
async def create_default_hosted_agent(
    req: Request,
    db: Session = Depends(get_db),
):
    """Create a default unnamed haberagent for quick onboarding (e.g., invite link flow).
    Idempotent: returns existing agent if user already has one."""
    user_id = _require_user_id(req)

    # If user already has a hosted agent, return it
    existing_hosted = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if existing_hosted:
        return _to_response(existing_hosted)

    # If user has an OpenClaw agent, return info about it instead of creating
    from app.models import Agent
    existing_openclaw = db.query(Agent).filter(Agent.user_id == user_id).first()
    if existing_openclaw:
        raise HTTPException(
            status_code=400,
            detail="You already have an OpenClaw agent linked. No need to create a hosted agent.",
        )

    # Create a default agent with a placeholder name
    ha = hosted_agent_service.create_hosted_agent(
        db, user_id, display_name="My Agent", pricing_tier="free"
    )
    return _to_response(ha)


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

    if body.session_id:
        session = chat_service.get_session_by_id(db, ha, body.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
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

    # Capture IDs before the request-scoped db closes
    hosted_agent_id = ha.id
    requested_session_id = body.session_id

    def event_stream():
        # Use our own DB session so it stays open for the full stream duration
        stream_db = SessionLocal()
        try:
            from app.models.hosted_agent import HostedAgent
            stream_ha = stream_db.query(HostedAgent).get(hosted_agent_id)
            if requested_session_id:
                session = chat_service.get_session_by_id(stream_db, stream_ha, requested_session_id)
                if not session:
                    yield f"data: {json.dumps({'type': 'error', 'content': 'Session not found'})}\n\n"
                    return
            else:
                session = chat_service.get_or_create_session(stream_db, stream_ha)

            # Emit session_id so frontend can track the active session
            yield f"data: {json.dumps({'type': 'session_id', 'session_id': str(session.id)})}\n\n"

            stream = chat_service.stream_user_message(stream_db, stream_ha, session, body.content)
            try:
                for event_type, event_data in stream:
                    if event_type == "text":
                        yield f"data: {json.dumps({'type': 'chunk', 'content': event_data})}\n\n"
                    elif event_type == "action_start":
                        yield f"data: {json.dumps({'type': 'action_start', 'action': event_data['action'], 'question': event_data.get('question', ''), 'deliberation_id': event_data.get('deliberation_id')})}\n\n"
                    elif event_type == "action_done":
                        yield f"data: {json.dumps({'type': 'action_done', 'action': event_data['action'], 'question': event_data.get('question', ''), 'deliberation_id': event_data.get('deliberation_id'), 'description': event_data.get('description', ''), 'detail': event_data.get('detail', ''), 'reasoning': event_data.get('reasoning', '')})}\n\n"
            except Exception as e:
                logger.error(f"Chat stream error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'content': 'Something went wrong. Please try again.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        finally:
            stream_db.close()

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
    # Pre-fetch deliberation questions for interview sessions
    delib_ids = [s.deliberation_id for s in sessions if s.deliberation_id and s.session_type == "deliberation_join"]
    delib_map = {}
    if delib_ids:
        delibs = db.query(Deliberation).filter(Deliberation.id.in_(delib_ids)).all()
        delib_map = {d.id: d.question for d in delibs}
    return [
        ChatSessionSummary(
            id=str(s.id),
            topic=delib_map.get(s.deliberation_id, s.topic) if s.session_type == "deliberation_join" else s.topic,
            message_count=len(s.messages or []),
            created_at=s.created_at.isoformat(),
        )
        for s in sessions
    ]


@router.get("/me/chat/{session_id}")
async def get_chat_session(session_id: str, req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    session = chat_service.get_session_by_id(db, ha, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return ChatSessionResponse(
        id=str(session.id),
        topic=session.topic,
        messages=session.messages or [],
        created_at=session.created_at.isoformat(),
    )


# --- Manual heartbeat ---

@router.post("/me/heartbeat")
async def manual_heartbeat(req: Request, db: Session = Depends(get_db)):
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    result = run_single_hosted_agent(db, ha)
    return result


@router.post("/me/heartbeat/stream")
async def manual_heartbeat_stream(req: Request, db: Session = Depends(get_db)):
    """Stream heartbeat results as Server-Sent Events."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    hosted_agent_id = ha.id

    def event_stream():
        stream_db = SessionLocal()
        try:
            from app.models.hosted_agent import HostedAgent
            stream_ha = stream_db.query(HostedAgent).get(hosted_agent_id)
            for event in run_single_hosted_agent_stream(stream_db, stream_ha):
                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as e:
            logger.error(f"Heartbeat stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            stream_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- Re-rank ---

@router.put("/me/rankings/{deliberation_id}")
async def rerank_statements(
    deliberation_id: str,
    body: RerankRequest,
    req: Request,
    db: Session = Depends(get_db),
):
    """Allow user to update their agent's rankings on a deliberation."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    from app.services.continuous_deliberation_service import ContinuousDeliberationService
    delib = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    if not delib:
        raise HTTPException(status_code=404, detail="Deliberation not found")

    service = ContinuousDeliberationService(db)
    try:
        service.submit_ranking(delib, ha.agent, body.rankings)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Profile rebuild & transcript download ---

REBUILD_PROFILE_PROMPT = """\
You are rebuilding a user profile for a democratic deliberation platform called Habermolt.
The profile is used by an AI agent to represent this person's values and opinions in group
discussions on various topics.

## Current Profile
{current_profile}

## Active Deliberations This Person Participates In
{deliberation_context}

## Chat Transcripts (newest first)
{transcripts}

## Instructions
Produce an updated user profile in markdown. Follow these rules strictly:

1. PRESERVE everything from the current profile that is not contradicted by newer transcripts
2. ADD new values, opinions, and positions revealed in the transcripts
3. UPDATE positions where the user has clearly changed their mind — later sessions override earlier ones
4. ORGANIZE into clear thematic sections (e.g., "Core Values", "AI & Technology", "Governance", etc.)
5. USE the person's own words and phrasing where possible — do not editorialize or soften
6. BE CONCISE but comprehensive — every claim must be grounded in something the user actually said
7. NOTE apparent contradictions briefly rather than silently resolving them
8. WEIGHT positions expressed repeatedly across multiple sessions higher than one-off remarks

Output ONLY the profile markdown. No preamble, no explanation, no wrapping code fences."""


@router.post("/me/profile/rebuild")
async def rebuild_profile(body: RebuildProfileRequest, req: Request, db: Session = Depends(get_db)):
    """Use LLM to rebuild agent profile from chat transcripts + deliberation context."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    from app.models.agent_session import AgentSession
    from app.models.opinion import Opinion

    # Fetch sessions (selected or all, capped at 20 newest)
    query = db.query(AgentSession).filter(
        AgentSession.agent_id == ha.agent_id,
        AgentSession.session_type == "general",
    )
    if body.session_ids:
        query = query.filter(AgentSession.id.in_(body.session_ids))
    sessions = query.order_by(AgentSession.created_at.desc()).limit(20).all()

    if not sessions:
        raise HTTPException(status_code=400, detail="No chat sessions found to rebuild from.")

    # Format transcripts (newest first)
    transcripts = "\n---\n".join(
        chat_service.format_session_as_markdown(s) for s in sessions
    )

    # Fetch deliberation context: questions + agent's opinions
    opinions = (
        db.query(Opinion, Deliberation)
        .join(Deliberation, Opinion.deliberation_id == Deliberation.id)
        .filter(Opinion.agent_id == ha.agent_id)
        .all()
    )
    if opinions:
        delib_lines = []
        for opinion, delib in opinions:
            cats = ", ".join(delib.categories) if delib.categories else "uncategorized"
            delib_lines.append(f"- **Topic:** {delib.question}\n  **Categories:** {cats}\n  **Their opinion:** {opinion.opinion_text}")
        deliberation_context = "\n".join(delib_lines)
    else:
        deliberation_context = "(No deliberation participation yet)"

    current_profile = ha.user_profile or "(No existing profile)"

    prompt = REBUILD_PROFILE_PROMPT.format(
        current_profile=current_profile,
        deliberation_context=deliberation_context,
        transcripts=transcripts,
    )

    client = LLMClient(model_name=settings.HOSTED_AGENT_DEFAULT_MODEL)
    client.set_trace_context(
        trace_type="profile_rebuild",
        hosted_agent_id=ha.id,
        agent_id=ha.agent_id,
    )
    proposed = client.sample_text(prompt=prompt, max_tokens=4096, temperature=0.5)

    if not proposed.strip():
        raise HTTPException(status_code=500, detail="Failed to generate profile. Please try again.")

    return {
        "proposed_profile": proposed.strip(),
        "sessions_used": len(sessions),
        "current_profile": ha.user_profile or "",
    }


@router.get("/me/chat/{session_id}/download")
async def download_session(session_id: str, req: Request, db: Session = Depends(get_db)):
    """Download a single chat session as markdown."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")
    session = chat_service.get_session_by_id(db, ha, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    from fastapi.responses import Response
    content = chat_service.format_session_as_markdown(session)
    date_str = session.created_at.strftime("%Y-%m-%d") if session.created_at else "unknown"
    filename = f"transcript-{date_str}.md"
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/me/chat/download")
async def download_sessions(body: DownloadSessionsRequest, req: Request, db: Session = Depends(get_db)):
    """Download multiple chat sessions as a single markdown file."""
    user_id = _require_user_id(req)
    ha = hosted_agent_service.get_hosted_agent_by_user(db, user_id)
    if not ha:
        raise HTTPException(status_code=404, detail="No hosted agent found")

    from app.models.agent_session import AgentSession
    from fastapi.responses import Response

    sessions = (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == ha.agent_id,
            AgentSession.id.in_(body.session_ids),
        )
        .order_by(AgentSession.created_at.desc())
        .all()
    )

    content = "\n\n---\n\n".join(
        chat_service.format_session_as_markdown(s) for s in sessions
    )
    return Response(
        content=f"# Chat Transcripts\n\n{content}",
        media_type="text/markdown",
        headers={"Content-Disposition": 'attachment; filename="transcripts.md"'},
    )


# --- Cron heartbeat ---

@router.post("/heartbeat-all")
async def heartbeat_all(req: Request, db: Session = Depends(get_db)):
    _require_cron_secret(req)
    results = run_all_hosted_agents(db)
    return results
