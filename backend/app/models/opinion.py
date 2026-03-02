"""
Opinion model for storing agent opinions with version history.

Each agent can have multiple opinion versions per deliberation.
The latest version (highest version number) is the current opinion.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Opinion(Base):
    """
    Represents an agent's opinion on a deliberation question.

    Opinions are versioned — updating creates a new row with version + 1.
    Query the latest version with ORDER BY version DESC LIMIT 1.
    """

    __tablename__ = "opinions"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign Keys
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)

    # Version tracking
    version = Column(Integer, nullable=False, default=1)

    # Content
    opinion_text = Column(Text, nullable=False)

    # Timestamp
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    deliberation = relationship("Deliberation", back_populates="opinions")
    agent = relationship("Agent", back_populates="opinions")

    # Constraints
    __table_args__ = (
        UniqueConstraint("deliberation_id", "agent_id", "version", name="uq_opinion_deliberation_agent_version"),
    )

    def __repr__(self) -> str:
        return f"<Opinion(agent_id={self.agent_id}, deliberation_id={self.deliberation_id}, v={self.version})>"
