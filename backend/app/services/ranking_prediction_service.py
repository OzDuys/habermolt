"""
Service for predicting where past agents would place a new statement in their existing ranking.

Temporary simplified version: inserts new statements at the median position of each
agent's current ranking. The agent's next heartbeat will correct the position.
"""

import logging
from typing import Dict, List, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


class RankingPredictionService:
    """Predicts ranking positions for new statements based on median insertion."""

    def predict_positions_batched(
        self,
        agents_data: List[dict],
        new_statement: str,
        deliberation_id: Optional[UUID] = None,
    ) -> Dict[str, int]:
        """Return median position for each agent — no LLM call.

        Args:
            agents_data: List of {agent_id, current_ranking [{rank, ...}]}
            new_statement: Unused (kept for interface compat)
            deliberation_id: For logging

        Returns:
            Dict mapping agent_id (str) -> predicted position (1-indexed)
        """
        if not agents_data:
            return {}

        results = {}
        for agent in agents_data:
            n = len(agent["current_ranking"])
            median_pos = n // 2 + 1
            results[str(agent["agent_id"])] = median_pos

        logger.info(
            f"Median-insert prediction for {len(agents_data)} agents "
            f"(deliberation={deliberation_id}): {results}"
        )
        return results


# Global service instance
ranking_prediction_service = RankingPredictionService()
