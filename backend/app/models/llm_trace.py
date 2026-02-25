"""
LLM trace model for monitoring and debugging LLM API calls.

Stores full input/output for every LLM call made by the platform,
enabling LangSmith-style trace inspection and debugging.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class LLMTrace(Base):
    """A single LLM API call record for monitoring and debugging."""

    __tablename__ = "llm_traces"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Context (nullable — not all traces are tied to a deliberation/agent)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=True, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True, index=True)

    # Trace classification
    trace_type = Column(String(50), nullable=False, index=True)  # statement_generation, ranking_prediction, seed_opinion, title_differentiation, embedding
    status = Column(String(20), nullable=False, default="success", index=True)  # success, error

    # Model information
    model = Column(String(200), nullable=False, index=True)
    provider = Column(String(100), nullable=True)
    temperature = Column(Float, nullable=True)

    # Request data
    input_messages = Column(JSONB, nullable=False)  # [{role, content}, ...]

    # Response data
    output_text = Column(Text, nullable=True)
    reasoning_text = Column(Text, nullable=True)

    # Performance metrics
    tokens_in = Column(Integer, nullable=True)
    tokens_out = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)

    # Cost tracking (USD) — from OpenRouter usage.cost or estimated from pricing
    cost_input = Column(Float, nullable=True)
    cost_output = Column(Float, nullable=True)
    cost_total = Column(Float, nullable=True)

    # Error information
    error_message = Column(Text, nullable=True)

    # Timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
