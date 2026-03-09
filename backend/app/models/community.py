"""
Community model - persistent groups of users for ongoing deliberations.

A community is a persistent group where any member can create deliberations
scoped to the community. All members automatically have access to all
community deliberations (no per-deliberation invites needed).
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Community(Base):
    """A persistent group of users who deliberate together."""

    __tablename__ = "communities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String, unique=True, nullable=False, index=True)
    created_by_user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    members = relationship("CommunityMember", back_populates="community", cascade="all, delete-orphan")
    deliberations = relationship("Deliberation", back_populates="community")

    def __repr__(self) -> str:
        return f"<Community(name='{self.name}', invite_code='{self.invite_code}')>"
