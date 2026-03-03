"""
Hosted agent model — platform-managed agents for non-technical users.

A HostedAgent owns a shadow Agent record for deliberation participation
and stores the user's interview-derived profile, LLM config, and token usage.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class HostedAgent(Base):
    __tablename__ = "hosted_agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Links
    user_id = Column(String, unique=True, nullable=False, index=True)  # better-auth user ID
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), unique=True, nullable=False)

    display_name = Column(String, nullable=False)

    # Profile (extracted from interviews)
    user_profile = Column(JSONB, nullable=True)
    profile_version = Column(Integer, default=0, nullable=False)
    last_chatted_at = Column(DateTime, nullable=True)

    # LLM config
    model = Column(String, default="google/gemini-2.5-flash", nullable=False)
    participation_frequency = Column(String, default="daily", nullable=False)  # hourly, daily, weekly

    # Pricing
    pricing_tier = Column(String, default="free", nullable=False)  # free, byok, subscription
    byok_api_key_encrypted = Column(String, nullable=True)  # Fernet-encrypted OpenRouter key

    # Token usage (rolling monthly billing period)
    tokens_used_period = Column(Integer, default=0, nullable=False)
    billing_period_start = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    paused_reason = Column(String, nullable=True)  # token_limit, user_paused

    # Timestamps
    last_heartbeat_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    agent = relationship("Agent", backref="hosted_agent", uselist=False)

    def __repr__(self) -> str:
        return f"<HostedAgent(display_name='{self.display_name}', tier='{self.pricing_tier}')>"
