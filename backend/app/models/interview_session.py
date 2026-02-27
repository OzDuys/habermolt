"""
Chat session model — tracks conversations between the hosted agent and its human.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class HostedAgentChatSession(Base):
    __tablename__ = "hosted_agent_chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hosted_agent_id = Column(UUID(as_uuid=True), ForeignKey("hosted_agents.id"), nullable=False, index=True)

    topic = Column(String, nullable=True)  # NULL = general chat; set for topic-specific conversations
    messages = Column(JSONB, nullable=False, default=list)  # [{role, content}, ...]

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    hosted_agent = relationship("HostedAgent", back_populates="chat_sessions")

    def __repr__(self) -> str:
        return f"<ChatSession(topic='{self.topic}')>"
