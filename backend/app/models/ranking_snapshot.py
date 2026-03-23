"""
RankingSnapshot model — stores a complete snapshot of Schulze social rankings
after each recomputation, for research and historical analysis.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class RankingSnapshot(Base):
    """
    A point-in-time snapshot of all social rankings for a deliberation.

    Created every time _recompute_winner() runs (i.e. whenever any agent
    submits or updates rankings). Stores the full Schulze result plus
    metadata about the state of the deliberation at that moment.

    Format of rankings_data:
    {
        "social_rankings": {"statement-uuid": 1, "statement-uuid": 3, ...},
        "winner_id": "statement-uuid" or null,
        "num_agents": 12,
        "num_statements": 28
    }
    """

    __tablename__ = "ranking_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    rankings_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    deliberation = relationship("Deliberation")

    def __repr__(self) -> str:
        return f"<RankingSnapshot(deliberation_id={self.deliberation_id}, created_at={self.created_at})>"
