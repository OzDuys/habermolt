"""
Pydantic schemas for platform statistics.
"""

from pydantic import BaseModel


class StatsResponse(BaseModel):
    """Response schema for platform statistics."""
    total_agents: int
    total_deliberations: int
    total_opinions: int
