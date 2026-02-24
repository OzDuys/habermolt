"""
Deliberation model - the core state machine for managing deliberation sessions.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from typing import Optional
from pgvector.sqlalchemy import Vector

from app.database import Base


class MechanismType:
    """Type of deliberation mechanism."""
    STAGED = "staged"
    CONTINUOUS = "continuous"


class DeliberationStage:
    """Enum-like class for deliberation stages."""
    # Staged mechanism stages
    OPINION = "opinion"
    RANKING = "ranking"
    CRITIQUE = "critique"
    CONCLUDED = "concluded"
    FINALIZED = "finalized"
    # Continuous mechanism stage
    ACTIVE = "active"


class Deliberation(Base):
    """
    Represents a deliberation session with state machine logic.

    Stages:
    1. OPINION: Agents submit initial opinions
    2. RANKING: Agents rank generated statements
    3. CRITIQUE: Agents critique winning statement
    4. CONCLUDED: Waiting for human feedback
    5. FINALIZED: Complete, results visible

    The state machine automatically transitions when all participants
    complete the required action for each stage.
    """

    __tablename__ = "deliberations"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Deliberation Content
    question = Column(Text, nullable=False)  # The question being deliberated

    # Mechanism Type
    mechanism_type = Column(
        String,
        nullable=False,
        default=MechanismType.STAGED,
        index=True
    )

    # State Machine
    stage = Column(
        String,
        nullable=False,
        default=DeliberationStage.OPINION,
        index=True
    )

    # Participation
    created_by_agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    num_citizens = Column(Integer, default=0)  # Current number of participants
    join_window_deadline = Column(DateTime, nullable=True)  # 5-min window starts when 2+ agents join

    # Habermas Machine Configuration
    num_critique_rounds = Column(Integer, default=1, nullable=False)  # Total critique rounds
    current_critique_round = Column(Integer, default=0, nullable=False)  # Current round (0-indexed)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)  # When first opinion submitted
    concluded_at = Column(DateTime, nullable=True)  # When final statement determined
    finalized_at = Column(DateTime, nullable=True)  # When all feedback collected

    # Categories (agent-assigned or LLM-classified; multiple allowed)
    categories = Column(ARRAY(String), nullable=True, default=list)  # e.g. ["ai", "societal"]

    # Metadata (JSONB for flexibility) - renamed to meta_data to avoid SQLAlchemy conflict
    meta_data = Column(JSONB, default=dict)  # Store additional context, tags, etc.

    # Semantic embedding for duplicate detection (1536 dims = text-embedding-3-small)
    question_embedding = Column(Vector(1536), nullable=True)

    # Relationships
    creator = relationship("Agent", back_populates="created_deliberations", foreign_keys=[created_by_agent_id])
    opinions = relationship("Opinion", back_populates="deliberation", cascade="all, delete-orphan")
    statements = relationship("Statement", back_populates="deliberation", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="deliberation", cascade="all, delete-orphan")
    critiques = relationship("Critique", back_populates="deliberation", cascade="all, delete-orphan")
    human_feedback = relationship("HumanFeedback", back_populates="deliberation", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Deliberation(question='{self.question[:50]}...', stage='{self.stage}')>"

    def is_accepting_opinions(self) -> bool:
        """Check if deliberation is accepting new opinions."""
        return self.stage == DeliberationStage.OPINION

    def is_in_ranking_stage(self) -> bool:
        """Check if deliberation is in ranking stage."""
        return self.stage == DeliberationStage.RANKING

    def is_in_critique_stage(self) -> bool:
        """Check if deliberation is in critique stage."""
        return self.stage == DeliberationStage.CRITIQUE

    def is_concluded(self) -> bool:
        """Check if deliberation has concluded (waiting for feedback)."""
        return self.stage == DeliberationStage.CONCLUDED

    def is_finalized(self) -> bool:
        """Check if deliberation is finalized (complete)."""
        return self.stage == DeliberationStage.FINALIZED

    def get_final_statement(self) -> Optional["Statement"]:
        """Get the final consensus statement (winner of last round)."""
        if not self.is_concluded() and not self.is_finalized():
            return None

        # Find statement with social_ranking=1 from the last round
        final_statements = [
            s for s in self.statements
            if s.round_number == self.current_critique_round and s.social_ranking == 1
        ]
        return final_statements[0] if final_statements else None
