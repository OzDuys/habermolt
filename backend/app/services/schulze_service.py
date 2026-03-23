"""
Schulze social choice method for aggregating agent rankings.

Adapted from habermas_machine/social_choice/schulze_method.py and utils.py.
Implements the Schulze method (Schulze, M. 2011) with TBRC tie-breaking.
Reference: https://electowiki.org/wiki/Schulze_method
"""

import logging
from typing import Dict, List
from uuid import UUID

import numpy as np

from app.models import Ranking, Statement

logger = logging.getLogger(__name__)

RANKING_MOCK = -1


# ---------------------------------------------------------------------------
# Utility functions (from habermas_machine/social_choice/utils.py)
# ---------------------------------------------------------------------------

def _filter_out_mocks(rankings: np.ndarray) -> np.ndarray:
    """Filter out mock rankings (rows where all values are -1)."""
    if not np.issubdtype(rankings.dtype, np.integer):
        raise ValueError(
            f"The array should be an integer array but is {rankings.dtype}."
        )
    is_mock = rankings == RANKING_MOCK
    any_mock = is_mock.any(axis=1)
    all_mock = is_mock.all(axis=1)
    if not (any_mock == all_mock).all():
        raise ValueError(
            "If a citizen uses a mock rank for one candidate "
            "it should use a mock rank for all candidates."
        )
    return rankings[np.logical_not(any_mock)]


def _normalize_ranking(ranking: np.ndarray) -> np.ndarray:
    """Normalize ranking so e.g. [0, 2, 5, 5] -> [0, 1, 2, 2]."""
    _, normalized = np.unique(ranking, return_inverse=True)
    return normalized


def _is_untied(ranking: np.ndarray) -> bool:
    """Check if ranking has no ties."""
    return np.unique(ranking).size == ranking.size


def _untie_with_ballot(ranking: np.ndarray, ballot: np.ndarray) -> np.ndarray:
    """Untie ranking using an additional ballot and renormalize."""
    ranking = _normalize_ranking(ranking) * len(ranking) + _normalize_ranking(ballot)
    return _normalize_ranking(ranking)


def _check_rankings(rankings: np.ndarray) -> None:
    """Validate that a ranking array is well-formed (0-indexed, consecutive)."""
    if not np.issubdtype(rankings.dtype, np.integer):
        raise ValueError(
            f"The array should be an integer array but is {rankings.dtype}."
        )
    sorted_rankings = np.sort(rankings, axis=1)
    if np.any(sorted_rankings[:, 0] != 0):
        raise ValueError("All rankings should have a 0 as highest ranking")
    diff = np.diff(sorted_rankings, axis=1)
    if not np.all(np.logical_or(diff == 1, diff == 0)):
        raise ValueError(
            "Incorrect ratings, the step size between ratings should be 0 or 1."
        )


# ---------------------------------------------------------------------------
# Core Schulze algorithm (from habermas_machine/social_choice/schulze_method.py)
# ---------------------------------------------------------------------------

def _compute_pairwise_defeats(rankings: np.ndarray) -> np.ndarray:
    """Compute pairwise defeat counts. d[i,j] = number of voters preferring i over j."""
    num_citizens, num_candidates = rankings.shape
    defeats = np.zeros((num_candidates, num_candidates), dtype=np.int32)
    for c in range(num_citizens):
        for i in range(num_candidates):
            for j in range(num_candidates):
                if rankings[c, i] < rankings[c, j]:  # lower rank = better
                    defeats[i, j] += 1
    return defeats


def _compute_strongest_paths(defeats: np.ndarray) -> np.ndarray:
    """Floyd-Warshall to compute strongest path strengths between candidates."""
    num_candidates = defeats.shape[0]
    paths = np.zeros((num_candidates, num_candidates), dtype=np.int32)

    # Initialize: only paths where i strictly beats j
    for i in range(num_candidates):
        for j in range(num_candidates):
            if i != j and defeats[i, j] > defeats[j, i]:
                paths[i, j] = defeats[i, j]

    # Floyd-Warshall
    for k in range(num_candidates):
        for i in range(num_candidates):
            if i != k:
                for j in range(num_candidates):
                    if i != j and k != j:
                        paths[i, j] = max(
                            paths[i, j],
                            min(paths[i, k], paths[k, j]),
                        )
    return paths


def _rank_from_paths(paths: np.ndarray) -> np.ndarray:
    """Derive ranking from path strengths. Lower rank = better."""
    pairwise_dominance = (paths - paths.T) >= 0
    counts = pairwise_dominance.sum(axis=1)
    _, rankings = np.unique(-1 * counts, return_inverse=True)
    return rankings


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------

class SchulzeService:
    """Schulze method with TBRC tie-breaking for aggregating agent rankings."""

    def aggregate(
        self, rankings: np.ndarray, seed: int = None
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Aggregate agent rankings into a social ranking.

        Args:
            rankings: [num_agents, num_candidates], 0-indexed, lower = better
            seed: for tie-breaking randomness

        Returns:
            (tied_ranking, untied_ranking) — both shape [num_candidates]
        """
        rng = np.random.default_rng(seed)
        rankings = _filter_out_mocks(rankings)

        if rankings.size == 0:
            n = rankings.shape[1]
            tied = np.full(n, RANKING_MOCK, dtype=np.int32)
            untied = rng.permutation(np.arange(n)).astype(np.int32)
            return tied, untied

        _check_rankings(rankings)

        defeats = _compute_pairwise_defeats(rankings)
        paths = _compute_strongest_paths(defeats)
        social = _rank_from_paths(paths)

        if _is_untied(social):
            return social, social

        tied = social.copy()

        # TBRC: try random ballots to break ties
        shuffled = rankings.copy()
        rng.shuffle(shuffled)
        for ballot in shuffled:
            social = _untie_with_ballot(social, ballot)
            if _is_untied(social):
                return tied, social

        # Final fallback: random tie-breaking
        random_ballot = np.arange(social.size)
        rng.shuffle(random_ballot)
        social = _untie_with_ballot(social, random_ballot)
        return tied, social

    def aggregate_from_db(
        self,
        db_rankings: List[Ranking],
        statements: List[Statement],
    ) -> Dict[UUID, int]:
        """
        Convert DB rankings to numpy format, run Schulze, return {statement_id: social_rank}.

        Args:
            db_rankings: List of Ranking model instances from agents
            statements: List of Statement model instances for this round

        Returns:
            Dict mapping statement_id -> social_ranking (1-indexed, 1=winner)
        """
        statement_ids = [s.id for s in statements]
        id_to_col = {sid: idx for idx, sid in enumerate(statement_ids)}
        num_candidates = len(statement_ids)
        num_agents = len(db_rankings)

        # Build numpy rankings matrix
        matrix = np.zeros((num_agents, num_candidates), dtype=np.int32)
        for agent_idx, ranking in enumerate(db_rankings):
            for entry in ranking.statement_rankings:
                sid = UUID(entry["statement_id"]) if isinstance(entry["statement_id"], str) else entry["statement_id"]
                col = id_to_col.get(sid)
                if col is not None:
                    matrix[agent_idx, col] = entry["rank"] - 1  # Convert 1-indexed to 0-indexed

        # Normalize each row to remove gaps (e.g. [0,1,14,15] -> [0,1,2,3])
        # This is a safety net: pairwise results are identical, but _check_rankings
        # requires consecutive ranks.
        for i in range(num_agents):
            matrix[i] = _normalize_ranking(matrix[i])

        # Run Schulze
        _, untied = self.aggregate(matrix, seed=42)

        # Convert back to 1-indexed social rankings
        result = {}
        for idx, sid in enumerate(statement_ids):
            result[sid] = int(untied[idx]) + 1  # 1-indexed: 1 = winner

        logger.info(
            f"Schulze aggregation complete: {num_agents} agents, "
            f"{num_candidates} candidates"
        )
        return result


# Global service instance
schulze_service = SchulzeService()
