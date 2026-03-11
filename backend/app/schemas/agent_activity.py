"""
Pydantic schemas for agent activity/transparency endpoints.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
from uuid import UUID


class AgentRatingRequest(BaseModel):
    """Request schema for rating agent representation in a deliberation."""
    deliberation_id: UUID
    rating: int = Field(..., ge=1, le=5, description="How well the agent represented you (1-5)")
    feedback: Optional[str] = Field(None, max_length=2000, description="Optional feedback text")


class AgentRatingResponse(BaseModel):
    """Response schema for a submitted rating."""
    id: UUID
    deliberation_id: UUID
    rating: int
    feedback: Optional[str]
    submitted_at: datetime

    class Config:
        from_attributes = True


class ConsensusRatingRequest(BaseModel):
    """Request schema for rating consensus statement quality."""
    deliberation_id: UUID
    representativeness: int = Field(..., ge=1, le=5, description="Does it fairly reflect the group's views?")
    specificity: int = Field(..., ge=1, le=5, description="Is it concrete and actionable vs vague?")
    usefulness: int = Field(..., ge=1, le=5, description="Would you act on this or share it?")
    feedback: Optional[str] = Field(None, max_length=2000)


class ConsensusRatingResponse(BaseModel):
    """Response schema for a submitted consensus rating."""
    id: UUID
    deliberation_id: UUID
    statement_id: Optional[UUID] = None  # which statement was rated
    representativeness: int
    specificity: int
    usefulness: int
    feedback: Optional[str]
    submitted_at: datetime

    class Config:
        from_attributes = True


class ActivityRankingItem(BaseModel):
    """A single statement's rank from the agent's perspective."""
    statement_id: UUID
    statement_title: Optional[str]
    statement_text: str
    agent_rank: int
    social_ranking: Optional[int]  # consensus rank (None if not ranked by Schulze)
    is_seed: bool = False
    contributed_by_agent: bool = False  # whether this agent proposed this statement


class ActivityAction(BaseModel):
    """A single action the agent took, with timestamp."""
    action_type: str  # "opinion", "ranking", "statement", "created"
    timestamp: datetime
    detail: str  # human-readable description
    deliberation_id: Optional[UUID] = None
    deliberation_question: Optional[str] = None


class ActivityDeliberation(BaseModel):
    """Complete agent activity summary for one deliberation."""
    deliberation_id: UUID
    question: str
    stage: str

    # Deliberation metadata
    creator_agent_name: Optional[str] = None
    num_agents: int = 0
    categories: List[str] = []
    winning_statement_id: Optional[UUID] = None
    winning_statement_title: Optional[str] = None
    winning_statement_text: Optional[str] = None
    created_at: Optional[datetime] = None

    # What the agent submitted
    opinion_text: Optional[str] = None
    opinion_source: Optional[str] = None
    opinion_submitted_at: Optional[datetime] = None

    # Agent's ranking vs consensus
    rankings: List[ActivityRankingItem] = []

    # Statements the agent proposed
    proposed_statements: List[dict] = []  # [{title, statement_text, social_ranking, generated_at}]

    # Timeline of all actions
    actions: List[ActivityAction] = []

    # Existing ratings by this human (if any)
    my_rating: Optional[AgentRatingResponse] = None
    my_consensus_rating: Optional[ConsensusRatingResponse] = None

    # Summary stats
    num_statements_ranked: int = 0
    num_statements_proposed: int = 0
    agent_influenced_winner: bool = False  # agent's top-ranked statement became consensus winner
    is_creator: bool = False  # whether this agent created the deliberation
    is_private: bool = False
    community_id: Optional[UUID] = None
    community_name: Optional[str] = None


class AgentActivityStats(BaseModel):
    """Aggregate stats for the agent's activity."""
    total_deliberations: int = 0
    private_deliberations: int = 0
    opinions_submitted: int = 0
    rankings_done: int = 0
    statements_proposed: int = 0
    deliberations_created: int = 0


class AgentActivityResponse(BaseModel):
    """Full activity report for a human's agent."""
    agent_name: str
    agent_id: UUID
    total_deliberations: int
    deliberations: List[ActivityDeliberation]
    stats: AgentActivityStats = AgentActivityStats()

    # Flat timeline of recent actions across all deliberations
    recent_actions: List[ActivityAction] = []

    # Platform-wide stats
    average_rating: Optional[float] = None
    total_ratings: int = 0
