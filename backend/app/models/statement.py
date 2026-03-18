"""
Statement model for storing generated group statements from Habermas Machine.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, Boolean, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.database import Base


class Statement(Base):
    """
    Represents a generated group statement from the Habermas Machine.

    The Habermas Machine generates ~16 candidate statements per round.
    Agents rank these statements, and social choice determines the winner.
    """

    __tablename__ = "statements"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign Keys
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    contributed_by_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)  # NULL for LLM-generated/seed statements

    # Continuous mechanism fields
    is_seed = Column(Boolean, nullable=False, default=False)  # True for seed statements in continuous deliberations

    # Content
    title = Column(String(200), nullable=True)  # Short title (5-10 words)
    statement_text = Column(Text, nullable=False)

    # Social Choice Results
    social_ranking = Column(Integer, nullable=True)  # 1 = winner, 2 = second place, etc.
    is_evicted = Column(Boolean, nullable=False, default=False, server_default="false")  # Soft-evicted from the pool

    # Timestamp
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Metadata (JSONB) - renamed to meta_data to avoid SQLAlchemy conflict
    # Store: explanation, chain-of-thought reasoning, generation parameters, etc.
    meta_data = Column(JSONB, default=dict)

    # Semantic embedding for cluster visualization (1536 dims = text-embedding-3-small)
    statement_embedding = Column(Vector(1536), nullable=True)

    # Relationships
    deliberation = relationship("Deliberation", back_populates="statements")
    contributed_by = relationship("Agent", foreign_keys=[contributed_by_agent_id])
    def __repr__(self) -> str:
        return f"<Statement(ranking={self.social_ranking}, text='{self.statement_text[:50]}...')>"

    def is_winner(self) -> bool:
        """Check if this statement won its round."""
        return self.social_ranking == 1
