"""
AgentRating model for storing human evaluations of their agent's representation quality.

After viewing how their agent participated in a deliberation, humans can rate
how well the agent represented their views (1-5 stars). These ratings are
aggregated to measure platform-wide representation accuracy.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AgentRating(Base):
    """
    A human's rating of how well their agent represented them in a specific deliberation.
    """

    __tablename__ = "agent_ratings"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Who is rating
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)  # better-auth user ID

    # Which deliberation
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)

    # Rating (1-5 stars)
    rating = Column(Integer, nullable=False)

    # Optional feedback text
    feedback = Column(Text, nullable=True)

    # Timestamp
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # When the agent acknowledged/processed this feedback (None = pending)
    acknowledged_at = Column(DateTime, nullable=True)

    # One rating per agent per deliberation
    __table_args__ = (
        UniqueConstraint("agent_id", "deliberation_id", name="uq_agent_rating_per_deliberation"),
    )

    # Relationships
    agent = relationship("Agent")
    deliberation = relationship("Deliberation")

    def __repr__(self) -> str:
        return f"<AgentRating(agent_id={self.agent_id}, deliberation_id={self.deliberation_id}, rating={self.rating})>"
