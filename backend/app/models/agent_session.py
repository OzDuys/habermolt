"""
AgentSession model — unified session table for all agent-human conversations.

Replaces both HostedAgentChatSession and TopicInterviewSession.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)
    user_id = Column(String, nullable=True, index=True)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=True, index=True)

    session_type = Column(String, nullable=False)  # onboarding, deliberation, general
    phase = Column(String, nullable=True, index=True)  # browsing, setup, participating (deliberation sessions only)
    status = Column(String, default="active", nullable=False, index=True)  # active, completed, dismissed
    topic = Column(String, nullable=True)

    messages = Column(JSONB, nullable=False, default=list)
    setup_progress = Column(JSONB, nullable=True)  # {"current_step": "...", "completed_steps": [...], "error": null}
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<AgentSession(type='{self.session_type}', status='{self.status}')>"
