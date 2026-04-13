"""
Pydantic schemas for Deliberation of the Day (DotD) endpoints.
"""

from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional

from app.schemas.deliberation import DeliberationResponse


class DotdResponse(BaseModel):
    """Response for GET /api/dotd/current."""
    deliberation: DeliberationResponse
    featured_date: date
    selection_method: str
    meta_deliberation_id: Optional[str] = None
    selected_at: datetime

    class Config:
        from_attributes = True


class DotdOverrideRequest(BaseModel):
    """Request for POST /api/dotd/override."""
    deliberation_id: str
    target_date: Optional[date] = None  # defaults to today
