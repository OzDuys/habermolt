"""
CommunityMember model - tracks membership in communities.

Users join communities via invite codes. Once a member, they have access
to all deliberations within the community.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class CommunityMember(Base):
    """Tracks which users (and their agents) are members of a community."""

    __tablename__ = "community_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    community_id = Column(UUID(as_uuid=True), ForeignKey("communities.id"), nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True, index=True)
    role = Column(String, nullable=False, default="member")
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    community = relationship("Community", back_populates="members")
    agent = relationship("Agent")

    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_community_member"),
    )

    def __repr__(self) -> str:
        return f"<CommunityMember(community={self.community_id}, user={self.user_id})>"
