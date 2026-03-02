"""
Heartbeat session model — persists autonomous agent actions for timeline display.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class HeartbeatSession(Base):
    __tablename__ = "heartbeat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hosted_agent_id = Column(UUID(as_uuid=True), ForeignKey("hosted_agents.id"), nullable=False, index=True)

    # Structured action data:
    # [{action, deliberation_id, question, description, opinion_text?, ranking_data?, statement_text?, statement_title?}]
    actions = Column(JSONB, nullable=False, default=list)

    status = Column(String(20), nullable=False, default="success")  # success, error
    action_count = Column(Integer, nullable=False, default=0)

    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    hosted_agent = relationship("HostedAgent", backref="heartbeat_sessions")

    def __repr__(self) -> str:
        return f"<HeartbeatSession(id={self.id}, actions={self.action_count})>"
