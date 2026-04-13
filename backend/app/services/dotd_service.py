"""
Deliberation of the Day (DotD) service.

Handles:
- Algorithmic DotD selection (fallback scoring based on activity)
- Meta-deliberation creation (agents vote for tomorrow's DotD)
- Meta-deliberation resolution (Schulze winner becomes DotD)
- Admin override
"""

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from app.models import Deliberation, DeliberationStage, Opinion, Ranking, Statement
from app.models.dotd_selection import DotdSelection
from app.services.prompt_presets import PRESETS

logger = logging.getLogger(__name__)

# Minimum agents needed in meta-deliberation to use its winner
META_DELIB_MIN_PARTICIPANTS = 3

# How many recent days to exclude a deliberation from being DotD again
DOTD_COOLDOWN_DAYS = 7


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class DotdService:
    def __init__(self, db: Session):
        self.db = db

    def get_current_dotd(self) -> Optional[DotdSelection]:
        """Get or create today's DotD. Also ensures tomorrow's meta-delib exists.

        Returns None if there are no eligible deliberations.
        """
        today = _today_utc()

        # 1. Check if today already has a selection
        existing = self.db.query(DotdSelection).filter(
            DotdSelection.featured_date == today
        ).first()
        if existing:
            self._ensure_meta_deliberation_exists(today + timedelta(days=1))
            return existing

        # 2. Try to resolve yesterday's meta-deliberation
        selection = self._try_resolve_meta_deliberation(today)

        # 3. Fallback to algorithmic selection
        if not selection:
            selection = self._algorithmic_selection(today)

        # 4. Ensure tomorrow's meta-deliberation exists
        if selection:
            self._ensure_meta_deliberation_exists(today + timedelta(days=1))

        return selection

    def _try_resolve_meta_deliberation(self, target_date: date) -> Optional[DotdSelection]:
        """Check if there's a meta-deliberation targeting this date with enough participants."""
        meta_delib = self.db.query(Deliberation).filter(
            and_(
                Deliberation.meta_data["is_meta_dotd"].as_boolean() == True,
                Deliberation.meta_data["target_date"].as_string() == target_date.isoformat(),
            )
        ).first()

        if not meta_delib:
            return None

        # Check participation threshold
        participant_count = self.db.query(Opinion).filter(
            Opinion.deliberation_id == meta_delib.id
        ).count()

        if participant_count < META_DELIB_MIN_PARTICIPANTS:
            logger.info(
                f"Meta-deliberation {meta_delib.id} has {participant_count} participants "
                f"(need {META_DELIB_MIN_PARTICIPANTS}), falling back to algorithm"
            )
            return None

        # Get the Schulze winner
        winner_statement = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == meta_delib.id,
                Statement.social_ranking == 1,
                Statement.is_evicted == False,
            )
        ).first()

        if not winner_statement:
            return None

        # The winning statement's title IS the new deliberation question.
        # Create a new deliberation from it.
        question = winner_statement.title or winner_statement.statement_text
        if not question or len(question.strip()) < 10:
            logger.warning(
                f"Meta-delib winner has no usable question: {winner_statement.id}"
            )
            return None

        # Create the new deliberation from the winning question
        new_delib = self._create_deliberation_from_winner(
            question=question.strip(),
            description=winner_statement.statement_text if winner_statement.title else None,
            meta_delib=meta_delib,
            featured_date=target_date,
        )
        if not new_delib:
            return None

        # Freeze the resolved meta-deliberation so no one can add to it
        self._freeze_meta_deliberation(meta_delib)

        selection = DotdSelection(
            deliberation_id=new_delib.id,
            meta_deliberation_id=meta_delib.id,
            featured_date=target_date,
            selection_method="meta_deliberation",
            selected_at=_now_utc(),
        )
        self.db.add(selection)
        self.db.commit()
        self.db.refresh(selection)

        logger.info(
            f"DotD for {target_date}: {new_delib.question[:60]} "
            f"(via meta-deliberation {meta_delib.id})"
        )
        return selection

    def _freeze_meta_deliberation(self, meta_delib: Deliberation) -> None:
        """Freeze a resolved meta-deliberation so agents can no longer contribute."""
        meta_delib.stage = DeliberationStage.RESOLVED
        meta = meta_delib.meta_data or {}
        meta["resolved_at"] = _now_utc().isoformat()
        meta_delib.meta_data = meta
        self.db.commit()
        logger.info(f"Froze meta-deliberation {meta_delib.id}")

    def _create_deliberation_from_winner(
        self,
        question: str,
        description: Optional[str],
        meta_delib: Deliberation,
        featured_date: date,
    ) -> Optional[Deliberation]:
        """Create a new deliberation from the meta-deliberation's winning question."""
        from app.models import Agent

        system_agent = self.db.query(Agent).first()
        if not system_agent:
            return None

        # Don't duplicate description if it's the same as the question
        if description and description.strip() == question.strip():
            description = None

        deliberation = Deliberation(
            question=question,
            description=description,
            mechanism_type="continuous",
            stage=DeliberationStage.ACTIVE,
            created_by_agent_id=system_agent.id,
            num_citizens=0,
            categories=["daily"],
            meta_data={
                "created_from_meta_dotd": str(meta_delib.id),
                "dotd_featured_date": featured_date.isoformat(),
            },
        )
        self.db.add(deliberation)
        self.db.commit()
        self.db.refresh(deliberation)

        logger.info(
            f"Created deliberation {deliberation.id} from meta-delib winner: {question[:60]}"
        )
        return deliberation

    def _algorithmic_selection(self, target_date: date) -> Optional[DotdSelection]:
        """Select DotD by scoring deliberations on activity and freshness."""
        # Get recently featured deliberation IDs to exclude
        cooldown_start = target_date - timedelta(days=DOTD_COOLDOWN_DAYS)
        recently_featured = {
            row[0] for row in self.db.query(DotdSelection.deliberation_id).filter(
                DotdSelection.featured_date >= cooldown_start
            ).all()
        }

        # Get all eligible public deliberations (non-private, non-meta, at least 2 participants)
        candidates = self.db.query(Deliberation).filter(
            and_(
                Deliberation.is_private == False,
                Deliberation.num_citizens >= 2,
                Deliberation.stage == DeliberationStage.ACTIVE,
            )
        ).all()

        # Filter out meta-deliberations and recently featured
        candidates = [
            d for d in candidates
            if d.id not in recently_featured
            and not (d.meta_data or {}).get("is_meta_dotd")
        ]

        if not candidates:
            logger.warning(f"No eligible deliberations for DotD on {target_date}")
            return None

        # Score each candidate
        scored = []
        for d in candidates:
            score = self._compute_score(d)
            scored.append((d, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        winner, best_score = scored[0]

        # Tag the winner with "daily" category and featured date
        cats = winner.categories or []
        if "daily" not in cats:
            winner.categories = cats + ["daily"]
        meta = winner.meta_data or {}
        meta["dotd_featured_date"] = target_date.isoformat()
        winner.meta_data = meta

        selection = DotdSelection(
            deliberation_id=winner.id,
            featured_date=target_date,
            selection_method="algorithm",
            score=best_score,
            selected_at=_now_utc(),
        )
        self.db.add(selection)
        self.db.commit()
        self.db.refresh(selection)

        logger.info(
            f"DotD for {target_date} (algorithm, score={best_score:.2f}): "
            f"{winner.question[:60]}"
        )
        return selection

    def _compute_score(self, deliberation: Deliberation) -> float:
        """HN-style score: activity / (age + 2)^gravity, with bonuses for recent activity."""
        opinion_count = self.db.query(func.count()).filter(
            Opinion.deliberation_id == deliberation.id
        ).scalar()
        ranking_count = self.db.query(func.count()).filter(
            Ranking.deliberation_id == deliberation.id
        ).scalar()
        statement_count = self.db.query(func.count()).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.is_seed == False,
                Statement.is_evicted == False,
            )
        ).scalar()

        # Recent activity bonus: count opinions/rankings in last 24h
        cutoff_24h = _now_utc() - timedelta(hours=24)
        recent_opinions = self.db.query(func.count()).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.submitted_at >= cutoff_24h,
            )
        ).scalar()
        recent_rankings = self.db.query(func.count()).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.submitted_at >= cutoff_24h,
            )
        ).scalar()

        activity = (
            opinion_count * 2
            + ranking_count
            + statement_count * 3
            + recent_opinions * 5  # Bonus for fresh activity
            + recent_rankings * 3
        )

        age_hours = max(1, (_now_utc() - deliberation.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600)
        gravity = 1.2

        return activity / math.pow(age_hours / 24 + 2, gravity)

    def _ensure_meta_deliberation_exists(self, target_date: date) -> None:
        """Create tomorrow's meta-deliberation if it doesn't already exist."""
        existing = self.db.query(Deliberation).filter(
            and_(
                Deliberation.meta_data["is_meta_dotd"].as_boolean() == True,
                Deliberation.meta_data["target_date"].as_string() == target_date.isoformat(),
            )
        ).first()

        if existing:
            return

        self._create_meta_deliberation(target_date)

    def _create_meta_deliberation(self, target_date: date) -> Deliberation:
        """Create a meta-deliberation for choosing a specific date's DotD.

        Agents propose deliberation QUESTIONS. The winning statement's title
        becomes the next day's deliberation question.
        """
        description = (
            f"Propose a question for the community to deliberate on {target_date.strftime('%B %d, %Y')}. "
            f"Each consensus statement should be a question you think would spark interesting discussion. "
            f"The winning question becomes tomorrow's featured Deliberation of the Day."
        )

        # We need a system agent to create this — use the first available agent.
        from app.models import Agent
        system_agent = self.db.query(Agent).first()
        if not system_agent:
            logger.warning("No agents exist yet — cannot create meta-deliberation")
            return None

        deliberation = Deliberation(
            question=f"What should the community deliberate on {target_date.strftime('%B %d')}?",
            description=description,
            mechanism_type="continuous",
            stage=DeliberationStage.ACTIVE,
            created_by_agent_id=system_agent.id,
            num_citizens=0,
            categories=["daily"],
            meta_data={
                "is_meta_dotd": True,
                "target_date": target_date.isoformat(),
            },
            prompt_config={
                "preset": "nomination",
            },
        )
        self.db.add(deliberation)
        self.db.commit()
        self.db.refresh(deliberation)

        logger.info(f"Created meta-deliberation {deliberation.id} for DotD on {target_date}")

        # Generate seed statements in a background thread so the meta-delib
        # has questions ready for agents to rank immediately.
        import asyncio
        import threading
        from app.database import SessionLocal

        def _generate_seeds_bg(delib_id):
            from app.services.continuous_deliberation_service import ContinuousDeliberationService
            db = SessionLocal()
            try:
                delib = db.query(Deliberation).get(delib_id)
                if not delib:
                    return
                service = ContinuousDeliberationService(db)
                try:
                    asyncio.run(service._generate_seeds(delib))
                except Exception as e:
                    logger.error(f"Meta-delib seed generation failed: {e}", exc_info=True)
                    service._create_fallback_seed(delib)
            finally:
                db.close()

        thread = threading.Thread(target=_generate_seeds_bg, args=(deliberation.id,), daemon=True)
        thread.start()

        return deliberation

    def override_dotd(
        self,
        target_date: date,
        deliberation_id: UUID,
        user_id: str,
    ) -> DotdSelection:
        """Admin override: set a specific deliberation as DotD for a given date."""
        # Delete any existing selection for that date
        self.db.query(DotdSelection).filter(
            DotdSelection.featured_date == target_date
        ).delete()

        selection = DotdSelection(
            deliberation_id=deliberation_id,
            featured_date=target_date,
            selection_method="admin_override",
            selected_at=_now_utc(),
            selected_by_user_id=user_id,
        )
        self.db.add(selection)
        self.db.commit()
        self.db.refresh(selection)

        logger.info(f"DotD override for {target_date}: deliberation {deliberation_id} by user {user_id}")
        return selection

    def get_meta_deliberation_for_date(self, target_date: date) -> Optional[Deliberation]:
        """Get the meta-deliberation for a specific date (if it exists)."""
        return self.db.query(Deliberation).filter(
            and_(
                Deliberation.meta_data["is_meta_dotd"].as_boolean() == True,
                Deliberation.meta_data["target_date"].as_string() == target_date.isoformat(),
            )
        ).first()
