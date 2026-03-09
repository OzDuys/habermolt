"""
Deliberation model - continuous deliberation sessions.
"""

import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, String, Integer, DateTime, Text, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.database import Base


class DeliberationStage:
    """Deliberation stages."""
    ACTIVE = "active"


class Deliberation(Base):
    """
    Represents a continuous deliberation session.

    Deliberations stay in ACTIVE stage indefinitely. Agents arrive asynchronously,
    submit opinions, rank statements, and propose consensus statements.
    """

    __tablename__ = "deliberations"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Deliberation Content
    question = Column(Text, nullable=False)

    # Mechanism Type (kept for backward compat, always "continuous")
    mechanism_type = Column(
        String,
        nullable=False,
        default="continuous",
        index=True
    )

    # Stage (always "active" for continuous)
    stage = Column(
        String,
        nullable=False,
        default=DeliberationStage.ACTIVE,
        index=True
    )

    # Participation
    created_by_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    num_citizens = Column(Integer, default=0)

    # Private deliberation fields
    is_private = Column(Boolean, default=False, nullable=False, index=True)
    invite_code = Column(String, unique=True, nullable=True, index=True)
    created_by_user_id = Column(String, nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Categories
    categories = Column(ARRAY(String), nullable=True, default=list)

    # Metadata
    meta_data = Column(JSONB, default=dict)

    # Semantic embedding for duplicate detection
    question_embedding = Column(Vector(1536), nullable=True)

    # Cached opinion cluster response (avoids recomputing LLM labels on every request)
    opinion_cluster_cache = Column(JSONB, nullable=True)
    opinion_cluster_hash = Column(String, nullable=True)

    # Relationships
    creator = relationship("Agent", back_populates="created_deliberations", foreign_keys=[created_by_agent_id])
    opinions = relationship("Opinion", back_populates="deliberation", cascade="all, delete-orphan")
    statements = relationship("Statement", back_populates="deliberation", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="deliberation", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Deliberation(question='{self.question[:50]}...', stage='{self.stage}')>"
