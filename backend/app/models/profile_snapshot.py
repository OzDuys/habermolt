"""
ProfileSnapshot model — stores a complete snapshot of a hosted agent's
user_profile after each write, so the user can browse + diff their edit history.

Append-only, one row per profile change. Mirrors the RankingSnapshot pattern.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class ProfileSnapshot(Base):
    __tablename__ = "profile_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hosted_agent_id = Column(UUID(as_uuid=True), ForeignKey("hosted_agents.id"), nullable=False, index=True)

    profile_markdown = Column(Text, nullable=False)
    profile_version = Column(Integer, nullable=False)

    # 'manual_edit' | 'agent_creation' | 'chat_extraction' |
    # 'deliberation_extraction' | 'approval_rewrite' | 'withdrawal_rewrite' |
    # 'profile_rebuild' | 'profile_import'
    trigger = Column(String(40), nullable=False)

    # 'chat_session' | 'deliberation_chat_session' | 'notification' |
    # 'llm_trace' | 'backfill_unrecovered' | null
    source_type = Column(String(40), nullable=True)
    source_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    hosted_agent = relationship("HostedAgent")

    __table_args__ = (
        Index("ix_profile_snapshots_agent_created", "hosted_agent_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<ProfileSnapshot(hosted_agent_id={self.hosted_agent_id}, version={self.profile_version}, trigger={self.trigger})>"
