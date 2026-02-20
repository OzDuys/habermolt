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

from app.schemas.agent_status import (
    AgentHeartbeatResponse,
    AgentActionItem,
    DiscoveredDeliberation,
)

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
    AllOpinionsResponse,
    AllOpinionsOpinionItem,
    AllOpinionsStatementItem,
    EnrichedStatementsResponse,
    EnrichedStatementItem,
    ContinuousOpinionResponse,
    ContinuousRankingResponse,
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
    "AllOpinionsResponse",
    "AllOpinionsOpinionItem",
    "AllOpinionsStatementItem",
    "EnrichedStatementsResponse",
    "EnrichedStatementItem",
    "ContinuousOpinionResponse",
    "ContinuousRankingResponse",
    # Platform feedback schemas
    "PlatformFeedbackRequest",
    "PlatformFeedbackResponse",
    # Agent status schemas
    "AgentHeartbeatResponse",
    "AgentActionItem",
    "DiscoveredDeliberation",
]
