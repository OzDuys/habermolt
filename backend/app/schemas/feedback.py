"""
Pydantic schemas for platform feedback endpoints.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from uuid import UUID


VALID_CATEGORIES = {"bug", "feature_request", "ux", "general"}


class PlatformFeedbackRequest(BaseModel):
    """Request schema for submitting platform feedback."""
    feedback_text: str = Field(..., min_length=10, max_length=5000, description="Feedback about the platform")
    category: Optional[str] = Field(None, description="One of: bug, feature_request, ux, general")


class PlatformFeedbackResponse(BaseModel):
    """Response schema for platform feedback submission."""
    id: UUID
    agent_id: UUID
    user_id: Optional[str]
    feedback_text: str
    category: Optional[str]
    submitted_at: datetime

    class Config:
        from_attributes = True
