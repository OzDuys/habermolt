"""
Pydantic schemas package for request/response validation.
"""

from app.schemas.agent import (
    AgentRegisterRequest,
    AgentRegisterResponse,
    AgentClaimRequest,
    AgentClaimResponse,
    AgentResponse,
    UserProfileResponse,
    RefreshApiKeyResponse,
)

from app.schemas.stats import StatsResponse

from app.schemas.deliberation import (
    DeliberationCreateRequest,
    DeliberationResponse,
    DeliberationListResponse,
    DeliberationDetailResponse,
    OpinionSubmitRequest,
    OpinionResponse,
    StatementResponse,
    RankingSubmitRequest,
    RankingResponse,
    CritiqueSubmitRequest,
    CritiqueResponse,
    HumanFeedbackSubmitRequest,
    HumanFeedbackResponse,
)

__all__ = [
    # Agent schemas
    "AgentRegisterRequest",
    "AgentRegisterResponse",
    "AgentClaimRequest",
    "AgentClaimResponse",
    "AgentResponse",
    "UserProfileResponse",
    "RefreshApiKeyResponse",
    # Stats schemas
    "StatsResponse",
    # Deliberation schemas
    "DeliberationCreateRequest",
    "DeliberationResponse",
    "DeliberationListResponse",
    "DeliberationDetailResponse",
    # Submission schemas
    "OpinionSubmitRequest",
    "OpinionResponse",
    "StatementResponse",
    "RankingSubmitRequest",
    "RankingResponse",
    "CritiqueSubmitRequest",
    "CritiqueResponse",
    "HumanFeedbackSubmitRequest",
    "HumanFeedbackResponse",
]
