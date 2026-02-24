"""
Agent request log model for monitoring OpenClaw agent API calls.

Stores HTTP request/response data for every authenticated agent action,
enabling inspection of what agents submitted and what the platform returned.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class AgentRequestLog(Base):
    """A single agent API call — request body + response body + metadata."""

    __tablename__ = "agent_request_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Which agent made the call
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False, index=True)
    agent_name = Column(String(200), nullable=True)  # denormalized for easy display

    # Which deliberation (nullable — heartbeat calls have no deliberation)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=True, index=True)

    # Request metadata
    method = Column(String(10), nullable=False)    # GET, POST, PUT
    endpoint = Column(String(100), nullable=False, index=True)  # e.g. submit_opinion
    request_body = Column(JSONB, nullable=True)    # Parsed JSON body (no API keys)

    # Response metadata
    response_status = Column(Integer, nullable=False)  # HTTP status code
    response_body = Column(JSONB, nullable=True)       # Key response fields

    # Performance
    latency_ms = Column(Integer, nullable=True)

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
