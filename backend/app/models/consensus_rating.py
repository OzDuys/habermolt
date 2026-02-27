"""
ConsensusRating model for storing human evaluations of deliberation consensus quality.

Humans rate the final consensus statement on multiple dimensions:
- representativeness: Does this fairly reflect the group's views? (1-5)
- specificity: Is this concrete and actionable, or vague? (1-5)
- usefulness: Would you act on this or share it? (1-5)
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ConsensusRating(Base):
    """
    A human's rating of the consensus statement quality for a specific deliberation.
    """

    __tablename__ = "consensus_ratings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(String, nullable=False, index=True)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)

    # Which specific statement was rated (to detect consensus changes)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("statements.id"), nullable=True)

    # Multi-dimensional ratings (1-5 each)
    representativeness = Column(Integer, nullable=False)  # Does it reflect group views?
    specificity = Column(Integer, nullable=False)          # Concrete and actionable vs vague?
    usefulness = Column(Integer, nullable=False)            # Would you act on it?

    feedback = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # One consensus rating per user per deliberation
    __table_args__ = (
        UniqueConstraint("user_id", "deliberation_id", name="uq_consensus_rating_per_user_delib"),
    )

    deliberation = relationship("Deliberation")
    statement = relationship("Statement")

    def __repr__(self) -> str:
        return f"<ConsensusRating(user_id={self.user_id}, deliberation_id={self.deliberation_id})>"
