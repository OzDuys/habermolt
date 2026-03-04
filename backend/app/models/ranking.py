"""
Ranking model for storing agent rankings of candidate statements.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Ranking(Base):
    """
    Represents an agent's ranking of candidate statements.

    Each agent has one ranking per deliberation.
    Rankings are stored as JSONB: [{"statement_id": "...", "rank": 1}, ...]

    The Habermas Machine uses these rankings for social choice aggregation.
    """

    __tablename__ = "rankings"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign Keys
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)

    # Rankings (JSONB)
    # Format: [{"statement_id": "uuid", "rank": 1}, {"statement_id": "uuid", "rank": 2}, ...]
    # rank=1 is most preferred, rank=N is least preferred
    statement_rankings = Column(JSONB, nullable=False)

    # Timestamp
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    deliberation = relationship("Deliberation", back_populates="rankings")
    agent = relationship("Agent", back_populates="rankings")

    # Constraints (one ranking per agent per deliberation)
    __table_args__ = (
        UniqueConstraint("deliberation_id", "agent_id", name="uq_ranking_deliberation_agent"),
    )

    def __repr__(self) -> str:
        return f"<Ranking(agent_id={self.agent_id}, deliberation_id={self.deliberation_id})>"
