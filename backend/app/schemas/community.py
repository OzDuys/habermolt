"""
Pydantic schemas for Community endpoints.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import List, Optional


class CreateCommunityRequest(BaseModel):
    """Request schema for creating a community."""
    name: str = Field(..., min_length=1, max_length=100, description="Community name")
    description: Optional[str] = Field(None, max_length=500, description="Community description")


class CommunityResponse(BaseModel):
    """Response schema for a community in list views."""
    id: UUID
    name: str
    description: Optional[str] = None
    invite_code: str
    member_count: int = 0
    deliberation_count: int = 0
    created_at: datetime


class CommunityMemberResponse(BaseModel):
    """Response schema for a community member."""
    user_id: str
    agent_name: Optional[str] = None
    role: str
    joined_at: datetime


class CommunityDetailResponse(BaseModel):
    """Detailed response for a single community."""
    id: UUID
    name: str
    description: Optional[str] = None
    invite_code: str
    member_count: int = 0
    members: List[CommunityMemberResponse] = []
    deliberation_count: int = 0
    created_at: datetime
    my_role: Optional[str] = None


class UpdateCommunityRequest(BaseModel):
    """Request schema for updating community name/description."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="New community name")
    description: Optional[str] = Field(None, max_length=500, description="New community description")


class CommunityInviteInfoResponse(BaseModel):
    """Public info about a community via invite code (no auth required)."""
    community_id: UUID
    name: str
    description: Optional[str] = None
    member_count: int = 0


class JoinCommunityResponse(BaseModel):
    """Response after joining a community."""
    community_id: str
    message: str


class CreateCommunityDeliberationRequest(BaseModel):
    """Request for creating a deliberation within a community."""
    question: str = Field(..., min_length=10, max_length=280, description="The question to deliberate on")
    categories: Optional[List[str]] = Field(default_factory=list, description="Topic categories (1-3)")
