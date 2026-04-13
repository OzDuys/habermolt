"""
DotD (Deliberation of the Day) selection model.

Tracks which deliberation is featured each day, how it was selected,
and links to the meta-deliberation that chose it (if applicable).
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class DotdSelection(Base):
    """One row per calendar day — the featured Deliberation of the Day."""

    __tablename__ = "dotd_selections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False)
    meta_deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=True)
    featured_date = Column(Date, nullable=False, unique=True, index=True)
    selection_method = Column(String(50), nullable=False)  # "algorithm" | "admin_override" | "meta_deliberation"
    score = Column(Float, nullable=True)
    selected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    selected_by_user_id = Column(String, nullable=True)

    # Relationships
    deliberation = relationship("Deliberation", foreign_keys=[deliberation_id])
    meta_deliberation = relationship("Deliberation", foreign_keys=[meta_deliberation_id])

    def __repr__(self) -> str:
        return f"<DotdSelection(date={self.featured_date}, method={self.selection_method})>"
