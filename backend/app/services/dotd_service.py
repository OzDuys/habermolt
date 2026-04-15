"""
Deliberation of the Day (DotD) service.

Handles:
- Meta-deliberation creation (agents vote for tomorrow's DotD)
- Meta-deliberation resolution (Schulze winner becomes a brand new DotD)
- LLM-generated fallback question when the meta-delib has no statements
- Admin override

Every DotD is a freshly created Deliberation — we never tag existing
deliberations with the "daily" category.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import Deliberation, DeliberationStage, Opinion, Statement
from app.models.dotd_selection import DotdSelection

logger = logging.getLogger(__name__)


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

        # Always expire any meta-delibs whose target_date has passed, even if
        # they never reached quorum — otherwise they linger as ACTIVE and leak
        # onto the homepage.
        self._expire_stale_meta_deliberations(today)

        # 1. Check if today already has a selection
        existing = self.db.query(DotdSelection).filter(
            DotdSelection.featured_date == today
        ).first()
        if existing:
            self._freeze_meta_deliberation_for_date(today)
            self._ensure_meta_deliberation_exists(today + timedelta(days=1))
            return existing

        # 2. Try to resolve yesterday's meta-deliberation into a new DotD
        selection = self._try_resolve_meta_deliberation(today)

        # 3. Fallback: LLM-generate a fresh question when the meta-delib
        # produced no usable winner (no statements, no opinions, etc.)
        if not selection:
            selection = self._create_llm_fallback_dotd(today)

        # 4. Once today's DotD is secured, freeze today's meta-delib (it's done
        # regardless of whether it produced the winner or we used fallback).
        if selection:
            self._freeze_meta_deliberation_for_date(today)
            self._ensure_meta_deliberation_exists(today + timedelta(days=1))

        return selection

    def _freeze_meta_deliberation_for_date(self, target_date: date) -> None:
        """Freeze the meta-delib targeting this date if it's still ACTIVE."""
        meta_delib = self.db.query(Deliberation).filter(
            and_(
                Deliberation.meta_data["is_meta_dotd"].as_boolean() == True,
                Deliberation.meta_data["target_date"].as_string() == target_date.isoformat(),
                Deliberation.stage == DeliberationStage.ACTIVE,
            )
        ).first()
        if meta_delib:
            self._freeze_meta_deliberation(meta_delib)

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

        # Pick the top-ranked statement regardless of participation count.
        # Prefer the Schulze winner; if Schulze hasn't run (no rankings yet),
        # fall back to any statement in the pool so we still produce a DotD.
        winner_statement = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == meta_delib.id,
                Statement.social_ranking == 1,
                Statement.is_evicted == False,
            )
        ).first()

        if not winner_statement:
            winner_statement = self.db.query(Statement).filter(
                and_(
                    Statement.deliberation_id == meta_delib.id,
                    Statement.is_evicted == False,
                )
            ).order_by(Statement.created_at.asc()).first()

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

    def _expire_stale_meta_deliberations(self, today: date) -> None:
        """Mark any ACTIVE meta-delib whose target_date has passed as RESOLVED.

        Covers the case where a meta-delib never reached quorum or never produced
        a Schulze winner. Without this, those meta-delibs stay ACTIVE forever and
        show up on the homepage trending/top/recent tabs.
        """
        stale = self.db.query(Deliberation).filter(
            and_(
                Deliberation.meta_data["is_meta_dotd"].as_boolean() == True,
                Deliberation.stage == DeliberationStage.ACTIVE,
                Deliberation.meta_data["target_date"].as_string() < today.isoformat(),
            )
        ).all()

        if not stale:
            return

        now_iso = _now_utc().isoformat()
        for meta_delib in stale:
            meta_delib.stage = DeliberationStage.RESOLVED
            meta = meta_delib.meta_data or {}
            meta["resolved_at"] = now_iso
            meta["resolved_reason"] = "expired"
            meta_delib.meta_data = meta
            logger.info(f"Expired stale meta-deliberation {meta_delib.id} (target_date passed)")

        self.db.commit()

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

        self._spawn_seed_generation(deliberation.id)

        logger.info(
            f"Created deliberation {deliberation.id} from meta-delib winner: {question[:60]}"
        )
        return deliberation

    def _create_llm_fallback_dotd(self, target_date: date) -> Optional[DotdSelection]:
        """LLM-generate a fresh deliberation question when the meta-delib
        produced no usable winner (e.g. no statements at all).

        The LLM is shown recent deliberation questions so it can deliberately
        pick a topic that isn't already in the pool.
        """
        from app.models import Agent
        from app.services.llm_client import LLMClient, sanitize_prompt_text

        system_agent = self.db.query(Agent).first()
        if not system_agent:
            logger.warning("No system agent — cannot create fallback DotD")
            return None

        recent = self.db.query(Deliberation.question).filter(
            and_(
                Deliberation.is_private == False,
                Deliberation.created_at >= _now_utc() - timedelta(days=30),
            )
        ).order_by(Deliberation.created_at.desc()).limit(60).all()
        recent_questions = "\n".join(f"- {sanitize_prompt_text(r[0])}" for r in recent) or "(none)"

        prompt = (
            f"Generate ONE thought-provoking question for a public deliberation "
            f"on {target_date.strftime('%B %d, %Y')}. The question should spark "
            f"disagreement among thoughtful people and be timely but not ephemeral. "
            f"It must NOT duplicate or closely overlap any of the recent questions below.\n\n"
            f"Recent questions:\n{recent_questions}\n\n"
            f"Respond with ONLY the question text — no preamble, no quotes, no explanation."
        )

        try:
            llm = LLMClient()
            raw = llm.sample_text(prompt=prompt, max_tokens=200)
            question = raw.strip().strip('"').strip("'")
        except Exception as e:
            logger.error(f"LLM fallback generation failed: {e}", exc_info=True)
            return None

        if not question or len(question) < 10:
            logger.warning(f"LLM fallback produced unusable question: {question!r}")
            return None

        deliberation = Deliberation(
            question=question,
            description=None,
            mechanism_type="continuous",
            stage=DeliberationStage.ACTIVE,
            created_by_agent_id=system_agent.id,
            num_citizens=0,
            categories=["daily"],
            meta_data={
                "dotd_featured_date": target_date.isoformat(),
                "dotd_source": "llm_fallback",
            },
        )
        self.db.add(deliberation)
        self.db.commit()
        self.db.refresh(deliberation)

        # Kick off seed statement generation in the background
        self._spawn_seed_generation(deliberation.id)

        selection = DotdSelection(
            deliberation_id=deliberation.id,
            featured_date=target_date,
            selection_method="llm_fallback",
            selected_at=_now_utc(),
        )
        self.db.add(selection)
        self.db.commit()
        self.db.refresh(selection)

        logger.info(f"DotD for {target_date} (llm_fallback): {question[:80]}")
        return selection

    def _spawn_seed_generation(self, deliberation_id: UUID) -> None:
        """Generate seed statements for a freshly-created deliberation in a
        background thread so the request returns quickly."""
        import asyncio
        import threading
        from app.database import SessionLocal

        def _run(delib_id):
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
                    logger.error(f"Seed generation failed for {delib_id}: {e}", exc_info=True)
                    service._create_fallback_seed(delib)
            finally:
                db.close()

        threading.Thread(target=_run, args=(deliberation_id,), daemon=True).start()

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

        self._spawn_seed_generation(deliberation.id)

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
