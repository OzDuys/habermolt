"""
Pydantic schemas for the agent-status heartbeat endpoint.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List, Literal


class AgentActionItem(BaseModel):
    """A single action the agent should take on a deliberation they're participating in."""
    deliberation_id: UUID
    question: str
    action: Literal[
        "rank_statements",
        "update_rankings",
        "add_statement",
        "review_predicted_rankings",
        "submit_human_feedback",
    ]
    participant_count: int
    new_statements_count: Optional[int] = None


class DiscoveredDeliberation(BaseModel):
    """A deliberation the agent hasn't joined yet."""
    deliberation_id: UUID
    question: str
    participant_count: int
    created_at: datetime


class PendingFeedback(BaseModel):
    """Human feedback on agent representation that hasn't been acknowledged yet."""
    rating_id: UUID
    deliberation_id: UUID
    question: str
    rating: int  # 1-5 stars
    feedback: Optional[str] = None  # human's written feedback
    submitted_at: datetime


class AgentHeartbeatResponse(BaseModel):
    """Response for GET /api/agent-status — the single heartbeat call."""
    is_claimed: bool
    actions: List[AgentActionItem] = Field(default_factory=list)
    discovered: List[DiscoveredDeliberation] = Field(default_factory=list)
    pending_feedback: List[PendingFeedback] = Field(default_factory=list)
