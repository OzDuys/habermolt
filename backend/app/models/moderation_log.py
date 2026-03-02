"""
ModerationLog model for recording community guidelines check results.

Every moderation check (pass or fail) is logged so admins can review
rejected questions and tune the moderation prompt.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class ModerationLog(Base):
    __tablename__ = "moderation_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question = Column(Text, nullable=False)
    passed = Column(Boolean, nullable=False, index=True)
    reason = Column(Text, nullable=True)
    source = Column(String(50), nullable=True)  # "agent", "human_public", "human_private", "agent_private"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    def __repr__(self) -> str:
        return f"<ModerationLog(passed={self.passed}, question={self.question[:50]!r})>"
