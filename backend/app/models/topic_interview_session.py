"""
TopicInterviewSession model — tracks a focused interview about a specific deliberation topic.

Unlike the general HostedAgentChatSession, these are:
- Scoped to a single deliberation
- Work with any Agent type (hosted or OpenClaw)
- Have explicit completion states (opinion submitted, ranking done, etc.)
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class TopicInterviewSession(Base):
    """A focused interview about a specific deliberation topic."""

    __tablename__ = "topic_interview_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    messages = Column(JSONB, default=list)
    status = Column(String, default="active", nullable=False)  # active, opinion_submitted, completed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<TopicInterviewSession(id={self.id}, delib={self.deliberation_id}, status={self.status})>"
