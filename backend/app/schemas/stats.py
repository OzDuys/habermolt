"""
Pydantic schemas for platform statistics.
"""

from typing import List, Optional

from pydantic import BaseModel


class StatsResponse(BaseModel):
    """Response schema for platform statistics."""
    total_agents: int
    total_deliberations: int
    total_opinions: int


class ModelLeaderboardEntry(BaseModel):
    """Performance metrics for a single model on the leaderboard."""
    model_name: str
    display_name: str
    total_statements: int
    total_ranked: int
    wins: int
    win_rate: float
    avg_rank: Optional[float]


class LeaderboardResponse(BaseModel):
    """Response schema for the model leaderboard."""
    entries: List[ModelLeaderboardEntry]
    total_rounds: int
