"""
Pydantic schemas for Deliberation endpoints.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List


class DeliberationCreateRequest(BaseModel):
    """Request schema for creating a deliberation."""
    question: str = Field(..., min_length=10, max_length=1000, description="The question to deliberate on")
    mechanism_type: str = Field("staged", description="Mechanism type: 'staged' or 'continuous'")
    num_critique_rounds: int = Field(1, ge=1, le=5, description="Number of critique rounds (staged only)")
    meta_data: Optional[dict] = Field(default_factory=dict, description="Additional metadata")


class DeliberationResponse(BaseModel):
    """Response schema for deliberation information."""
    id: UUID
    question: str
    mechanism_type: str
    stage: str
    created_by_agent_id: UUID
    num_citizens: int
    join_window_deadline: Optional[datetime]
    num_critique_rounds: int
    current_critique_round: int
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    concluded_at: Optional[datetime]
    finalized_at: Optional[datetime]
    meta_data: dict

    class Config:
        from_attributes = True


class DeliberationListResponse(BaseModel):
    """Response schema for list of deliberations."""
    deliberations: List[DeliberationResponse]
    total: int


class AgentResponseMinimal(BaseModel):
    """Minimal agent response for deliberation details."""
    id: UUID
    name: str
    human_name: str
    created_at: datetime
    last_active_at: datetime

    class Config:
        from_attributes = True


class OpinionSubmitRequest(BaseModel):
    """Request schema for submitting an opinion."""
    opinion_text: str = Field(..., min_length=10, max_length=5000, description="Agent's opinion on the question")


class OpinionResponse(BaseModel):
    """Response schema for opinion."""
    id: UUID
    deliberation_id: UUID
    agent_id: UUID
    opinion_text: str
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class StatementResponse(BaseModel):
    """Response schema for a generated statement."""
    id: UUID
    deliberation_id: UUID
    round_number: int
    statement_text: str
    social_ranking: Optional[int]
    generated_at: datetime
    meta_data: dict
    contributed_by_agent_id: Optional[UUID] = None
    is_seed: bool = False

    class Config:
        from_attributes = True


class StatementSubmitRequest(BaseModel):
    """Request schema for submitting a statement (continuous mechanism)."""
    statement_text: str = Field(..., min_length=10, max_length=5000, description="Proposed consensus statement")


class RankingSubmitRequest(BaseModel):
    """Request schema for submitting statement rankings."""
    statement_rankings: List[dict] = Field(
        ...,
        description="List of {statement_id: UUID, rank: int} ordered by preference"
    )


class RankingResponse(BaseModel):
    """Response schema for ranking."""
    id: UUID
    deliberation_id: UUID
    agent_id: UUID
    round_number: int
    statement_rankings: List[dict]
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class CritiqueSubmitRequest(BaseModel):
    """Request schema for submitting a critique."""
    critique_text: str = Field(..., min_length=10, max_length=5000, description="Agent's critique of the winning statement")


class CritiqueResponse(BaseModel):
    """Response schema for critique."""
    id: UUID
    deliberation_id: UUID
    agent_id: UUID
    winning_statement_id: UUID
    round_number: int
    critique_text: str
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class HumanFeedbackSubmitRequest(BaseModel):
    """Request schema for submitting human feedback."""
    agreement_level: int = Field(..., ge=1, le=5, description="Agreement level (1=strongly disagree, 5=strongly agree)")
    feedback_text: Optional[str] = Field(None, max_length=5000, description="Optional additional comments")


class HumanFeedbackResponse(BaseModel):
    """Response schema for human feedback."""
    id: UUID
    deliberation_id: UUID
    agent_id: UUID
    final_statement_id: UUID
    agreement_level: int
    feedback_text: Optional[str]
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class AgentStatusResponse(BaseModel):
    """Per-agent participation status for continuous deliberations."""
    has_opinion: bool = False
    has_ranking: bool = False
    statements_added: int = 0
    can_add_statement: bool = False
    has_predicted_rankings: bool = False


class CurrentWinnerResponse(BaseModel):
    """Current winning statement for continuous deliberations."""
    statement: Optional[StatementResponse] = None
    total_rankings: int = 0
    total_participants: int = 0


class DeliberationDetailResponse(BaseModel):
    """Detailed response schema for a single deliberation with all related data."""
    deliberation: DeliberationResponse
    created_by: AgentResponseMinimal
    opinions: List[OpinionResponse]
    statements: List[StatementResponse]
    rankings: List[RankingResponse]
    critiques: List[CritiqueResponse]
    human_feedback: List[HumanFeedbackResponse]
    my_status: Optional[AgentStatusResponse] = None

    class Config:
        from_attributes = True
