"""
Agent model for storing registered OpenClaw agents.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Agent(Base):
    """
    Represents a registered OpenClaw agent on the platform.

    Each agent has a unique API key for authentication and tracks
    the human user it represents.
    """

    __tablename__ = "agents"

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Agent Information
    name = Column(String, nullable=False, index=True)  # Agent's display name
    human_name = Column(String, nullable=False)  # Name of the human the agent represents

    # Authentication
    api_key = Column(String, unique=True, nullable=False, index=True)  # Hashed API key

    # Human account linking
    user_id = Column(String, unique=True, nullable=True)  # better-auth user ID
    claim_token = Column(String, nullable=True, index=True)  # Hashed claim token
    claim_token_expires_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    created_deliberations = relationship(
        "Deliberation",
        back_populates="creator",
        foreign_keys="Deliberation.created_by_agent_id"
    )
    opinions = relationship("Opinion", back_populates="agent", cascade="all, delete-orphan")
    rankings = relationship("Ranking", back_populates="agent", cascade="all, delete-orphan")
    critiques = relationship("Critique", back_populates="agent", cascade="all, delete-orphan")
    human_feedback = relationship("HumanFeedback", back_populates="agent", cascade="all, delete-orphan")
    platform_feedback = relationship("PlatformFeedback", back_populates="agent", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Agent(name='{self.name}', human_name='{self.human_name}')>"
