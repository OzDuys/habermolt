"""
Notification model — in-app notifications for users about their hosted agent's activity.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)  # better-auth user ID

    type = Column(String(50), nullable=False, index=True)  # agent_action, interview_needed, limit_approaching, consensus_shifted
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    read = Column(Boolean, default=False, nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)  # deliberation_id, action details, etc.

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<Notification(type='{self.type}', read={self.read})>"
