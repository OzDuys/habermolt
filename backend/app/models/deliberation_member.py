"""
DeliberationMember model - tracks membership in private deliberations.

Agents must be members before they can participate (submit opinions, rank, etc.)
in a private deliberation. For public deliberations, membership is not required.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class DeliberationMember(Base):
    """Tracks which agents are members of a private deliberation."""

    __tablename__ = "deliberation_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    joined_by_user_id = Column(String, nullable=True)  # The human who clicked "join"

    __table_args__ = (
        UniqueConstraint("deliberation_id", "agent_id", name="uq_deliberation_member"),
    )

    def __repr__(self) -> str:
        return f"<DeliberationMember(deliberation={self.deliberation_id}, agent={self.agent_id})>"
