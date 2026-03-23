"""
Deliberation analysis service — computes statement dynamics and opinion dynamics
labels for each deliberation, stored in meta_data for display on homepage tiles.

Statement dynamics (consensus trajectory):
  - converging: winner has been stable, rankings tightening
  - contested: top statements neck-and-neck, winner flipping
  - settled: clear dominant winner for a long time
  - volatile: frequent winner changes, no pattern
  - emerging: too few rankings to characterize

Opinion dynamics (how participants relate):
  - polarized: two distinct opposing camps
  - fragmented: many small factions
  - aligned: everyone broadly agrees
  - diverse: wide spread but no clear factions
  - lopsided: one large majority vs small minority
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.deliberation import Deliberation
from app.models.opinion import Opinion
from app.models.ranking_snapshot import RankingSnapshot

logger = logging.getLogger(__name__)


def compute_statement_dynamics(deliberation: Deliberation, db: Session) -> Optional[str]:
    """
    Classify the consensus trajectory based on ranking snapshots and consensus history.
    Uses ranking_snapshots when available, falls back to consensus_history.
    """
    consensus_history = (deliberation.meta_data or {}).get("consensus_history", [])

    # Check ranking snapshots (richer data)
    snapshots = db.query(RankingSnapshot).filter(
        RankingSnapshot.deliberation_id == deliberation.id,
    ).order_by(RankingSnapshot.created_at.asc()).all()

    # Need at least some data to classify
    num_rankings = deliberation.num_citizens
    if num_rankings < 3 and len(snapshots) < 3:
        return None

    # If we have snapshots, use them for richer analysis
    if len(snapshots) >= 3:
        return _classify_from_snapshots(snapshots, consensus_history)

    # Fall back to consensus_history only
    return _classify_from_history(consensus_history, deliberation)


def _classify_from_snapshots(snapshots: list, consensus_history: list) -> str:
    """Classify using full ranking snapshot data."""
    # Extract winner sequence
    winners = []
    for snap in snapshots:
        data = snap.rankings_data or {}
        winner_id = data.get("winner_id")
        if winner_id:
            winners.append(winner_id)

    if not winners:
        return None

    # How many unique winners?
    unique_winners = len(set(winners))
    total_snapshots = len(winners)

    # What fraction of snapshots had the current winner?
    current_winner = winners[-1]
    current_winner_count = winners.count(current_winner)
    current_winner_ratio = current_winner_count / total_snapshots

    # How many winner changes?
    num_changes = len(consensus_history)

    # Recent stability: how many of the last N snapshots had the same winner?
    recent_window = min(10, total_snapshots)
    recent_winners = winners[-recent_window:]
    recent_stability = recent_winners.count(current_winner) / len(recent_winners)

    # Check margin between top 2 in latest snapshot
    latest_data = snapshots[-1].rankings_data or {}
    social_rankings = latest_data.get("social_rankings", {})
    margins = _get_top_margin(social_rankings)

    # Classification logic
    if current_winner_ratio > 0.8 and recent_stability == 1.0 and total_snapshots >= 10:
        return "settled"

    if recent_stability >= 0.8 and num_changes <= 2:
        return "converging"

    if recent_stability >= 0.7:
        return "converging"

    # High winner volatility
    if unique_winners >= 4 and num_changes >= 4:
        return "volatile"

    # Top 2 very close or winner keeps flipping recently
    if margins is not None and margins <= 1:
        return "contested"

    recent_unique = len(set(recent_winners))
    if recent_unique >= 3:
        return "contested"

    return "converging"


def _get_top_margin(social_rankings: dict) -> Optional[int]:
    """Get the rank gap between #1 and #2 statements. Returns None if < 2 statements."""
    if len(social_rankings) < 2:
        return None
    sorted_ranks = sorted(social_rankings.values())
    # Margin is always 1 in Schulze (ranks are 1, 2, 3...) but ties can occur
    # Count how many statements share rank 1
    rank_1_count = sum(1 for r in social_rankings.values() if r == 1)
    if rank_1_count > 1:
        return 0  # Tie at the top
    return sorted_ranks[1] - sorted_ranks[0]  # Usually 1, but could indicate ties


def _classify_from_history(consensus_history: list, deliberation: Deliberation) -> str:
    """Classify using only consensus_history (no snapshots available)."""
    num_changes = len(consensus_history)

    if num_changes == 0:
        # Winner has never changed
        if deliberation.num_citizens >= 5:
            return "settled"
        return "converging"

    # Check recency of changes
    now = datetime.now(timezone.utc)
    recent_changes = 0
    for entry in consensus_history:
        lost_at = entry.get("lost_at")
        if lost_at:
            try:
                t = datetime.fromisoformat(lost_at)
                if (now - t) < timedelta(days=3):
                    recent_changes += 1
            except (ValueError, TypeError):
                pass

    if num_changes >= 4 and recent_changes >= 2:
        return "volatile"

    if recent_changes >= 2:
        return "contested"

    if num_changes <= 1 and deliberation.num_citizens >= 5:
        return "converging"

    return "contested" if num_changes >= 3 else "converging"


def compute_opinion_dynamics(deliberation: Deliberation, db: Session) -> Optional[str]:
    """
    Classify opinion landscape shape using opinion embeddings.
    Uses cosine distance + DBSCAN clustering.
    """
    # Get latest opinion per agent (with embeddings)
    from sqlalchemy import func
    latest_versions = db.query(
        Opinion.agent_id,
        func.max(Opinion.version).label("max_version"),
    ).filter(
        Opinion.deliberation_id == deliberation.id,
    ).group_by(Opinion.agent_id).subquery()

    opinions = db.query(Opinion).join(
        latest_versions,
        and_(
            Opinion.agent_id == latest_versions.c.agent_id,
            Opinion.version == latest_versions.c.max_version,
        )
    ).filter(
        Opinion.deliberation_id == deliberation.id,
        Opinion.opinion_embedding.isnot(None),
    ).all()

    if len(opinions) < 3:
        return None  # Not enough opinions to classify

    # Build embedding matrix
    embeddings = []
    for op in opinions:
        emb = op.opinion_embedding
        if emb is not None:
            embeddings.append(np.array(emb, dtype=np.float64))

    if len(embeddings) < 3:
        return None

    X = np.vstack(embeddings)

    # Normalize for cosine distance
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1
    X_norm = X / norms

    # Compute pairwise cosine distances
    similarity = X_norm @ X_norm.T
    distances = 1.0 - similarity
    np.fill_diagonal(distances, 0)

    # Overall spread (mean pairwise distance)
    n = len(embeddings)
    mean_dist = distances.sum() / (n * (n - 1)) if n > 1 else 0

    # DBSCAN clustering
    from sklearn.cluster import DBSCAN

    # Adaptive eps based on distance distribution
    upper_tri = distances[np.triu_indices(n, k=1)]
    eps = float(np.percentile(upper_tri, 30)) if len(upper_tri) > 0 else 0.3
    eps = max(eps, 0.05)  # Floor

    clustering = DBSCAN(eps=eps, min_samples=2, metric="precomputed").fit(distances)
    labels = clustering.labels_
    n_clusters = len(set(labels) - {-1})  # Exclude noise
    n_noise = (labels == -1).sum()

    # Cluster sizes (excluding noise)
    cluster_sizes = []
    for c in set(labels) - {-1}:
        cluster_sizes.append((labels == c).sum())
    cluster_sizes.sort(reverse=True)

    # Classification
    if mean_dist < 0.15:
        return "aligned"

    if n_clusters == 2 and n_noise <= n * 0.2:
        # Two clear camps
        if len(cluster_sizes) >= 2:
            ratio = cluster_sizes[1] / cluster_sizes[0]
            if ratio < 0.3:
                return "lopsided"
            return "polarized"

    if n_clusters >= 3:
        return "fragmented"

    if n_clusters == 1 and n_noise > n * 0.3:
        return "diverse"

    if mean_dist > 0.4:
        return "diverse"

    if n_clusters <= 1 and mean_dist < 0.3:
        return "aligned"

    return "diverse"


def update_deliberation_dynamics(deliberation: Deliberation, db: Session,
                                  update_statements: bool = True,
                                  update_opinions: bool = True) -> None:
    """
    Compute and store dynamics labels in deliberation.meta_data.
    Called after Schulze recomputation and/or opinion submission.
    """
    from sqlalchemy.orm.attributes import flag_modified

    meta = dict(deliberation.meta_data or {})
    changed = False

    if update_statements:
        try:
            label = compute_statement_dynamics(deliberation, db)
            if label and label != meta.get("statement_dynamics"):
                meta["statement_dynamics"] = label
                changed = True
        except Exception as e:
            logger.warning(f"Failed to compute statement dynamics for {deliberation.id}: {e}")

    if update_opinions:
        try:
            label = compute_opinion_dynamics(deliberation, db)
            if label and label != meta.get("opinion_dynamics"):
                meta["opinion_dynamics"] = label
                changed = True
        except Exception as e:
            logger.warning(f"Failed to compute opinion dynamics for {deliberation.id}: {e}")

    if changed:
        deliberation.meta_data = meta
        flag_modified(deliberation, "meta_data")
