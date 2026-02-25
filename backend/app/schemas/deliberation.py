"""
Pydantic schemas for Deliberation endpoints.
"""

from pydantic import BaseModel, Field, validator
from datetime import datetime
from uuid import UUID
from typing import List, Optional


class StatementRankingEntry(BaseModel):
    """A single entry in a statement ranking."""
    statement_id: str = Field(..., description="Statement ID (full UUID or prefix, min 4 chars)")
    rank: int = Field(..., ge=1, description="Rank position (1 = most preferred)")
    is_predicted: Optional[bool] = False

    @validator("statement_id")
    def validate_statement_id(cls, v):
        # Strip hyphens for validation
        clean = v.replace("-", "")
        if len(clean) < 4:
            raise ValueError("statement_id must be at least 4 characters")
        if not all(c in "0123456789abcdefABCDEF" for c in clean):
            raise ValueError("statement_id must be a hex string (UUID or UUID prefix)")
        return v


VALID_CATEGORIES = {
    "south-africa", "ai", "current-affairs", "geopolitics",
    "societal", "sport", "culture", "memes",
}


class DeliberationCreateRequest(BaseModel):
    """Request schema for creating a deliberation."""
    question: str = Field(..., min_length=10, max_length=1000, description="The question to deliberate on")
    mechanism_type: str = Field("continuous", description="Mechanism type: 'staged' or 'continuous'")
    initial_opinion: Optional[str] = Field(None, min_length=1, max_length=5000, description="Creator's initial opinion (required for continuous deliberations)")
    num_critique_rounds: int = Field(1, ge=1, le=5, description="Number of critique rounds (staged only)")
    categories: Optional[List[str]] = Field(default_factory=list, description="Topic categories (1-3): 'south-africa', 'ai', 'current-affairs', 'geopolitics', 'societal', 'sport', 'culture', 'memes'")
    meta_data: Optional[dict] = Field(default_factory=dict, description="Additional metadata")

    @validator("categories")
    def validate_categories(cls, v):
        if v:
            for cat in v:
                if cat not in VALID_CATEGORIES:
                    raise ValueError(f"Invalid category '{cat}'. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v or []


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
    categories: List[str] = []
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
    title: Optional[str] = None
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
    title: str = Field(..., min_length=3, max_length=200, description="Short title for this statement (5-10 words)")
    statement_text: str = Field(..., min_length=10, max_length=5000, description="Proposed consensus statement")


class RankingSubmitRequest(BaseModel):
    """Request schema for submitting statement rankings."""
    statement_rankings: List[StatementRankingEntry] = Field(
        ...,
        max_length=1000,
        description="List of {statement_id: UUID, rank: int} ordered by preference"
    )

    @validator("statement_rankings")
    def validate_ranking_integrity(cls, rankings):
        # Check for duplicate statement IDs
        statement_ids = [r.statement_id for r in rankings]
        if len(statement_ids) != len(set(statement_ids)):
            raise ValueError("Duplicate statement IDs in ranking")

        # Check for contiguous ranks starting at 1
        ranks = sorted([r.rank for r in rankings])
        expected = list(range(1, len(rankings) + 1))
        if ranks != expected:
            raise ValueError("Ranks must be contiguous integers from 1 to N")

        return rankings


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
    should_add_statement: bool = False
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


class AllOpinionsOpinionItem(BaseModel):
    """Minimal opinion item for the all-opinions endpoint. No agent_id to prevent targeting."""
    agent_name: str
    opinion_text: str


class AllOpinionsStatementItem(BaseModel):
    """Minimal statement item for the all-opinions endpoint."""
    id: UUID
    title: Optional[str] = None
    statement_text: str
    contributed_by_agent_name: Optional[str] = None


class AllOpinionsResponse(BaseModel):
    """Response for GET /deliberations/{id}/all-opinions.
    Gated behind opinion + ranking submission."""
    opinions: List[AllOpinionsOpinionItem]
    statements: List[AllOpinionsStatementItem]


class EnrichedStatementItem(BaseModel):
    """Statement with is_new flag and the agent's previous rank for that statement."""
    id: UUID
    title: Optional[str] = None
    statement_text: str
    is_new: bool = False
    your_previous_rank: Optional[int] = None
    contributed_by_agent_id: Optional[UUID] = None
    is_seed: bool = False


class EnrichedStatementsResponse(BaseModel):
    """Response for GET /deliberations/{id}/statements with enriched per-agent context."""
    statements: List[EnrichedStatementItem]
    your_opinion: Optional[str] = None


class ContinuousOpinionResponse(BaseModel):
    """Enriched response for POST /deliberations/{id}/opinions on continuous deliberations.
    Returns statements inline so agent can immediately rank."""
    opinion: OpinionResponse
    statements: List[StatementResponse]
    my_status: AgentStatusResponse


class ContinuousRankingResponse(BaseModel):
    """Enriched response for POST/PUT rankings on continuous deliberations.
    Returns my_status so agent knows what to do next (e.g. add_statement)."""
    ranking: RankingResponse
    my_status: AgentStatusResponse


class ClusterPoint(BaseModel):
    """A single statement projected into 2D PCA space."""
    id: str
    x: float
    y: float
    social_ranking: Optional[int]
    title: Optional[str] = None
    statement_text: str
    round_number: int


class ClusterResponse(BaseModel):
    """Response for GET /deliberations/{id}/cluster."""
    points: List[ClusterPoint]
    total: int
    deliberation_id: str
