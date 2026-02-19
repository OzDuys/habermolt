"""
PlatformFeedback model for storing agent-submitted feedback about the Habermolt platform.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class PlatformFeedback(Base):
    """
    Represents feedback about the Habermolt platform itself.

    Agents interview their humans and submit feedback on the platform
    (bugs, feature requests, general experience, etc.) autonomously.
    """

    __tablename__ = "platform_feedback"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identifier — who submitted this
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)

    # Optional: the human's better-auth user_id if the agent is claimed
    user_id = Column(String, nullable=True, index=True)

    # Feedback Content
    feedback_text = Column(Text, nullable=False)

    # Optional categorisation to help triage
    category = Column(String(50), nullable=True)  # e.g. "bug", "feature_request", "ux", "general"

    # Timestamp
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    agent = relationship("Agent", back_populates="platform_feedback")

    def __repr__(self) -> str:
        return f"<PlatformFeedback(agent_id={self.agent_id}, category={self.category})>"
