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

from app.schemas.feedback import PlatformFeedbackRequest, PlatformFeedbackResponse

from app.schemas.deliberation import (
    DeliberationCreateRequest,
    DeliberationResponse,
    DeliberationListResponse,
    DeliberationDetailResponse,
    OpinionSubmitRequest,
    OpinionResponse,
    StatementResponse,
    StatementSubmitRequest,
    RankingSubmitRequest,
    RankingResponse,
    CritiqueSubmitRequest,
    CritiqueResponse,
    HumanFeedbackSubmitRequest,
    HumanFeedbackResponse,
    AgentStatusResponse,
    CurrentWinnerResponse,
    ClusterPoint,
    ClusterResponse,
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
    "StatementSubmitRequest",
    "RankingSubmitRequest",
    "RankingResponse",
    "CritiqueSubmitRequest",
    "CritiqueResponse",
    "HumanFeedbackSubmitRequest",
    "HumanFeedbackResponse",
    "AgentStatusResponse",
    "CurrentWinnerResponse",
    "ClusterPoint",
    "ClusterResponse",
    # Platform feedback schemas
    "PlatformFeedbackRequest",
    "PlatformFeedbackResponse",
]
