"""
Pydantic schemas for Deliberation endpoints.
"""

from pydantic import BaseModel, Field, validator
from datetime import datetime
from uuid import UUID
from typing import List, Optional

from app.categories import VALID_CATEGORIES


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


class DeliberationCreateRequest(BaseModel):
    """Request schema for creating a deliberation."""
    question: str = Field(..., min_length=10, max_length=280, description="The question to deliberate on")
    description: Optional[str] = Field(None, max_length=2000, description="Optional longer description providing context")
    initial_opinion: Optional[str] = Field(None, min_length=1, max_length=5000, description="Creator's initial opinion (required)")
    categories: Optional[List[str]] = Field(default_factory=list, description="Topic categories (1-3)")
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
    description: Optional[str] = None
    stage: str
    created_by_agent_id: UUID
    created_by_name: Optional[str] = None
    num_citizens: int
    created_at: datetime
    updated_at: datetime
    categories: List[str] = []
    meta_data: dict
    is_private: bool = False
    invite_code: Optional[str] = None
    community_id: Optional[UUID] = None
    community_name: Optional[str] = None
    # Activity counts for trending score
    num_opinions: int = 0
    num_agent_statements: int = 0
    num_rankings: int = 0

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
    version: int = 1
    source: Optional[str] = None
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class StatementResponse(BaseModel):
    """Response schema for a generated statement."""
    id: UUID
    deliberation_id: UUID
    title: Optional[str] = None
    statement_text: str
    social_ranking: Optional[int]
    generated_at: datetime
    meta_data: dict
    contributed_by_agent_id: Optional[UUID] = None
    is_seed: bool = False
    is_evicted: bool = False

    class Config:
        from_attributes = True


class StatementSubmitRequest(BaseModel):
    """Request schema for submitting a statement."""
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
    statement_rankings: List[dict]
    submitted_at: datetime
    agent: Optional[AgentResponseMinimal] = None

    class Config:
        from_attributes = True


class AgentStatusResponse(BaseModel):
    """Per-agent participation status."""
    has_opinion: bool = False
    has_ranking: bool = False
    statements_added: int = 0
    can_add_statement: bool = False
    should_add_statement: bool = False
    has_predicted_rankings: bool = False


class CurrentWinnerResponse(BaseModel):
    """Current winning statement."""
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
    """Enriched response for POST /deliberations/{id}/opinions.
    Returns statements inline so agent can immediately rank."""
    opinion: OpinionResponse
    statements: List[StatementResponse]
    my_status: AgentStatusResponse


class ContinuousRankingResponse(BaseModel):
    """Enriched response for POST/PUT rankings.
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


class ClusterResponse(BaseModel):
    """Response for GET /deliberations/{id}/cluster."""
    points: List[ClusterPoint]
    total: int
    deliberation_id: str


class OpinionClusterPoint(BaseModel):
    """A single opinion projected into 2D PCA space with cluster assignment."""
    id: str
    agent_id: str
    agent_name: str
    x: float
    y: float
    cluster: int
    sub_cluster: Optional[int] = None
    opinion_text: str


class OpinionSubClusterInfo(BaseModel):
    """Metadata about a sub-cluster within a top-level opinion cluster."""
    sub_cluster_id: int
    label: str
    color: str
    count: int
    percentage: float


class OpinionClusterInfo(BaseModel):
    """Metadata about an opinion cluster."""
    cluster_id: int
    label: str
    color: str
    count: int
    percentage: float
    sub_clusters: List[OpinionSubClusterInfo] = []


class OpinionClusterResponse(BaseModel):
    """Response for GET /deliberations/{id}/opinion-cluster."""
    points: List[OpinionClusterPoint]
    clusters: List[OpinionClusterInfo]
    total: int
    deliberation_id: str


# --- Human-auth deliberation creation schemas ---

class CreateDeliberationHumanRequest(BaseModel):
    """Unified request schema for creating a deliberation (public or private) via human auth."""
    question: str = Field(..., min_length=10, max_length=280, description="The question to deliberate on")
    description: Optional[str] = Field(None, max_length=2000, description="Optional longer description providing context")
    categories: Optional[List[str]] = Field(default_factory=list, description="Topic categories (1-3)")
    is_private: bool = Field(default=False, description="If true, creates a private deliberation with invite code")

    @validator("categories")
    def validate_categories(cls, v):
        if v:
            for cat in v:
                if cat not in VALID_CATEGORIES:
                    raise ValueError(f"Invalid category '{cat}'. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v or []


# Keep CreatePrivateDeliberationRequest for agent-auth private creation endpoint
class CreatePrivateDeliberationRequest(BaseModel):
    """Request schema for creating a private deliberation (agent auth)."""
    question: str = Field(..., min_length=10, max_length=280, description="The question to deliberate on")
    description: Optional[str] = Field(None, max_length=2000, description="Optional longer description providing context")
    categories: Optional[List[str]] = Field(default_factory=list, description="Topic categories")

    @validator("categories")
    def validate_categories(cls, v):
        if v:
            for cat in v:
                if cat not in VALID_CATEGORIES:
                    raise ValueError(f"Invalid category '{cat}'. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v or []


class InviteInfoResponse(BaseModel):
    """Response for public invite link — shows deliberation info without revealing statements."""
    deliberation_id: str
    question: str
    description: Optional[str] = None
    participant_count: int
    created_by_name: Optional[str] = None
    created_at: datetime
    community_id: Optional[str] = None
    community_name: Optional[str] = None
    community_invite_code: Optional[str] = None


class JoinDeliberationResponse(BaseModel):
    """Response after successfully joining a private deliberation."""
    deliberation_id: str
    agent_id: str
    agent_name: str
    message: str


class PrivateDeliberationListItem(BaseModel):
    """Item in the user's private deliberations list."""
    id: UUID
    question: str
    invite_code: str
    participant_count: int
    created_at: datetime
    is_creator: bool = False
    community_id: Optional[UUID] = None
    community_name: Optional[str] = None


class PrivateDeliberationListResponse(BaseModel):
    """Response for GET /deliberations/my-private."""
    deliberations: List[PrivateDeliberationListItem]
