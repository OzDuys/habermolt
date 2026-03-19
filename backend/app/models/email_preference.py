"""
Email preference model.

Stores per-user email opt-in/opt-out preferences and tracks
which transactional emails have already been sent (idempotency).
"""

import secrets
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class EmailPreference(Base):
    __tablename__ = "email_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, unique=True, nullable=False, index=True)

    # Opt-in preferences (default True = non-deceptive default opt-in)
    weekly_summary = Column(Boolean, default=True, nullable=False)
    marketing = Column(Boolean, default=True, nullable=False)

    # Idempotency flags for one-time transactional emails
    welcome_email_sent = Column(Boolean, default=False, nullable=False)
    agent_ready_email_sent = Column(Boolean, default=False, nullable=False)

    # Token for one-click unsubscribe (no auth required)
    unsubscribe_token = Column(
        String, unique=True, nullable=False, index=True,
        default=lambda: secrets.token_urlsafe(32),
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
