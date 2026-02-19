"""
Service for the continuous deliberation mechanism.

Unlike staged deliberations, continuous deliberations:
- Stay in ACTIVE stage indefinitely
- Allow agents to arrive asynchronously (opinion → ranking → optional statement)
- Predict rankings for past agents when new statements are added
- Recompute the winner after every ranking change
"""

import asyncio
import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models import (
    Deliberation,
    DeliberationStage,
    MechanismType,
    Agent,
    Opinion,
    Ranking,
    Statement,
)
from app.config import settings
from app.services.statement_service import statement_service
from app.services.schulze_service import schulze_service
from app.services.ranking_prediction_service import ranking_prediction_service

logger = logging.getLogger(__name__)


class ContinuousDeliberationService:
    """Service for managing continuous deliberation mechanism."""

    def __init__(self, db: Session):
        self.db = db

    async def create_deliberation(
        self,
        question: str,
        creator_agent: Agent,
        initial_opinion: str,
        meta_data: dict = None,
    ) -> Deliberation:
        """Create a continuous deliberation with seed statements.

        Requires an initial_opinion from the creator — this seeds the diverse
        perspectives used to generate the initial statement pool.
        """
        if not initial_opinion or not initial_opinion.strip():
            raise ValueError("initial_opinion is required to create a continuous deliberation")

        deliberation = Deliberation(
            question=question,
            mechanism_type=MechanismType.CONTINUOUS,
            stage=DeliberationStage.ACTIVE,
            created_by_agent_id=creator_agent.id,
            num_citizens=0,
            num_critique_rounds=0,
            current_critique_round=0,
            meta_data=meta_data or {},
        )
        self.db.add(deliberation)
        self.db.commit()
        self.db.refresh(deliberation)

        # Submit creator's opinion before generating seed statements
        self.submit_opinion(deliberation, creator_agent, initial_opinion)

        # Generate seed opinions (synthetic diverse perspectives)
        seed_opinions = await self._generate_seed_opinions(question, creator_opinion=initial_opinion)

        # Always include the creator's real opinion so the LLM has substantive input
        if initial_opinion.strip() not in seed_opinions:
            seed_opinions.insert(0, initial_opinion.strip())

        logger.info(
            f"Generating seed statements from {len(seed_opinions)} opinions "
            f"for deliberation {deliberation.id}"
        )

        # Generate seed statements from the synthetic opinions
        seed_statements = await statement_service.generate_statements(
            self.db,
            deliberation,
            seed_opinions,
            round_number=0,
        )

        # Mark them as seeds
        for stmt in seed_statements:
            stmt.is_seed = True
        self.db.commit()

        logger.info(
            f"Created continuous deliberation {deliberation.id} with "
            f"{len(seed_statements)} seed statements"
        )
        return deliberation

    async def _generate_seed_opinions(self, question: str, creator_opinion: str = None) -> List[str]:
        """Generate synthetic diverse opinions to seed statement generation.

        Retries up to 3 times if the LLM call fails or returns unparseable output.
        Always includes the creator_opinion as the first opinion to guarantee
        at least one substantive opinion in the list.
        """
        from app.services.llm_client import LLMClient

        client = LLMClient()

        creator_context = ""
        if creator_opinion:
            creator_context = (
                f"\nOne participant has already expressed this view:\n"
                f"\"{creator_opinion}\"\n\n"
                f"Generate perspectives that are DIFFERENT from this view to maximize diversity.\n"
            )

        prompt = (
            f"A group is deliberating on the following question:\n"
            f"\"{question}\"\n"
            f"{creator_context}\n"
            f"Generate {settings.CONTINUOUS_NUM_SEED_OPINIONS} diverse perspectives "
            f"on this topic. Each perspective should represent a different viewpoint "
            f"that a reasonable person might hold. Format as a numbered list.\n\n"
            f"Return ONLY the numbered list, one perspective per line."
        )

        max_attempts = 3
        for attempt in range(max_attempts):
            response = await asyncio.to_thread(
                client.sample_text, prompt, temperature=0.9
            )

            if not response or not response.strip():
                logger.warning(
                    f"Seed opinion generation attempt {attempt + 1}/{max_attempts} "
                    f"returned empty response (model={client._model_name})"
                )
                continue

            # Parse numbered list
            opinions = []
            for line in response.strip().split("\n"):
                line = line.strip()
                if line and line[0].isdigit():
                    # Strip the number prefix (e.g. "1. opinion text" or "1) opinion text")
                    for sep in [".", ")", ":"]:
                        idx = line.find(sep)
                        if idx != -1 and line[:idx].strip().isdigit():
                            text = line[idx + 1:].strip()
                            if text:
                                opinions.append(text)
                            break

            # Filter out any empty strings that slipped through
            opinions = [o for o in opinions if o.strip()]

            if len(opinions) >= 2:
                return opinions[:settings.CONTINUOUS_NUM_SEED_OPINIONS]

            logger.warning(
                f"Seed opinion generation attempt {attempt + 1}/{max_attempts} "
                f"parsed only {len(opinions)} opinions from response: "
                f"{response[:200]}"
            )

        # All retries exhausted — use creator opinion as the sole seed opinion
        # so statement generation at least has something substantive to work with
        if creator_opinion and creator_opinion.strip():
            logger.warning(
                "Seed opinion generation failed after all retries. "
                "Falling back to creator opinion only."
            )
            return [creator_opinion.strip()]

        raise RuntimeError(
            "Failed to generate seed opinions after all retries and no creator opinion available"
        )

    def submit_opinion(
        self,
        deliberation: Deliberation,
        agent: Agent,
        opinion_text: str,
    ) -> Opinion:
        """Submit an opinion for a continuous deliberation."""
        if deliberation.mechanism_type != MechanismType.CONTINUOUS:
            raise ValueError("Not a continuous deliberation")
        if deliberation.stage != DeliberationStage.ACTIVE:
            raise ValueError("Deliberation is not active")

        # Check for existing opinion
        existing = self.db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.agent_id == agent.id,
            )
        ).first()
        if existing:
            raise ValueError("Agent has already submitted an opinion")

        opinion = Opinion(
            deliberation_id=deliberation.id,
            agent_id=agent.id,
            opinion_text=opinion_text,
        )
        self.db.add(opinion)
        deliberation.num_citizens = len(deliberation.opinions) + 1
        self.db.commit()
        self.db.refresh(opinion)
        return opinion

    def submit_ranking(
        self,
        deliberation: Deliberation,
        agent: Agent,
        statement_rankings: List[dict],
    ) -> Ranking:
        """Submit or update a ranking for a continuous deliberation."""
        if deliberation.mechanism_type != MechanismType.CONTINUOUS:
            raise ValueError("Not a continuous deliberation")
        if deliberation.stage != DeliberationStage.ACTIVE:
            raise ValueError("Deliberation is not active")

        # Require opinion first
        has_opinion = self.db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.agent_id == agent.id,
            )
        ).first()
        if not has_opinion:
            raise ValueError("Must submit an opinion before ranking")

        # Check for existing ranking (continuous uses round_number=0)
        existing = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.agent_id == agent.id,
                Ranking.round_number == 0,
            )
        ).first()

        if existing:
            # Update existing ranking
            existing.statement_rankings = statement_rankings
            self.db.commit()
            self.db.refresh(existing)
            ranking = existing
        else:
            ranking = Ranking(
                deliberation_id=deliberation.id,
                agent_id=agent.id,
                round_number=0,
                statement_rankings=statement_rankings,
            )
            self.db.add(ranking)
            self.db.commit()
            self.db.refresh(ranking)

        # Recompute winner
        self._recompute_winner(deliberation)

        return ranking

    async def add_statement(
        self,
        deliberation: Deliberation,
        agent: Agent,
        statement_text: str,
        statement_title: str,
    ) -> Statement:
        """Add a new statement to the pool and predict rankings for past agents."""
        if deliberation.mechanism_type != MechanismType.CONTINUOUS:
            raise ValueError("Not a continuous deliberation")
        if deliberation.stage != DeliberationStage.ACTIVE:
            raise ValueError("Deliberation is not active")

        # Validate: agent must have opinion + ranking
        has_opinion = self.db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.agent_id == agent.id,
            )
        ).first()
        if not has_opinion:
            raise ValueError("Must submit an opinion before adding a statement")

        has_ranking = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.agent_id == agent.id,
                Ranking.round_number == 0,
            )
        ).first()
        if not has_ranking:
            raise ValueError("Must submit a ranking before adding a statement")

        # Check per-agent limit
        agent_statement_count = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.contributed_by_agent_id == agent.id,
            )
        ).count()
        if agent_statement_count >= settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT:
            raise ValueError(
                f"Agent has reached the maximum of {settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT} statements"
            )

        # Check pool cap
        total_statements = self.db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).count()
        if total_statements >= settings.CONTINUOUS_MAX_STATEMENTS:
            raise ValueError(
                f"Statement pool is full ({settings.CONTINUOUS_MAX_STATEMENTS} max)"
            )

        # Create the statement
        statement = Statement(
            deliberation_id=deliberation.id,
            contributed_by_agent_id=agent.id,
            round_number=0,
            title=statement_title or None,
            statement_text=statement_text,
            is_seed=False,
            meta_data={"contributed_by": str(agent.id)},
        )
        self.db.add(statement)
        self.db.commit()
        self.db.refresh(statement)

        # Predict rankings for all past agents who have a ranking
        await self._predict_rankings_for_new_statement(deliberation, statement)

        # Add the new statement to the contributor's own ranking at position 1
        # (they proposed it, so they presumably rank it highest)
        if has_ranking:
            updated = list(has_ranking.statement_rankings)
            for entry in updated:
                entry["rank"] += 1  # Shift all existing ranks down
            updated.append({
                "statement_id": str(statement.id),
                "rank": 1,
            })
            has_ranking.statement_rankings = updated
            self.db.commit()

        # Recompute winner
        self._recompute_winner(deliberation)

        logger.info(
            f"Agent {agent.id} added statement {statement.id} to "
            f"deliberation {deliberation.id}"
        )
        return statement

    async def _predict_rankings_for_new_statement(
        self,
        deliberation: Deliberation,
        new_statement: Statement,
    ) -> None:
        """Predict where each past agent would place the new statement."""
        # Get all agents with rankings (except the statement contributor)
        rankings = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.round_number == 0,
                Ranking.agent_id != new_statement.contributed_by_agent_id,
            )
        ).all()

        # Get all statements for text lookup
        statements = self.db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).all()
        stmt_text_map = {str(s.id): s.statement_text for s in statements}

        for ranking in rankings:
            # Get this agent's opinion
            opinion = self.db.query(Opinion).filter(
                and_(
                    Opinion.deliberation_id == deliberation.id,
                    Opinion.agent_id == ranking.agent_id,
                )
            ).first()
            if not opinion:
                continue

            # Build current ranking with statement texts
            current_ranking_with_text = []
            for entry in ranking.statement_rankings:
                sid = entry["statement_id"]
                current_ranking_with_text.append({
                    "rank": entry["rank"],
                    "statement_id": sid,
                    "statement_text": stmt_text_map.get(str(sid), ""),
                })

            # Predict position
            position = await asyncio.to_thread(
                ranking_prediction_service.predict_position,
                opinion.opinion_text,
                current_ranking_with_text,
                new_statement.statement_text,
            )

            # Insert into ranking at predicted position
            updated_rankings = list(ranking.statement_rankings)
            # Shift ranks for entries at or below the predicted position
            for entry in updated_rankings:
                if entry["rank"] >= position:
                    entry["rank"] += 1
            # Add new entry
            updated_rankings.append({
                "statement_id": str(new_statement.id),
                "rank": position,
                "is_predicted": True,
            })
            ranking.statement_rankings = updated_rankings

        self.db.commit()

    def _recompute_winner(self, deliberation: Deliberation) -> None:
        """Recompute the current winner using Schulze on all rankings."""
        rankings = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.round_number == 0,
            )
        ).all()

        statements = self.db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).all()

        if not rankings or not statements:
            return

        social_rankings = schulze_service.aggregate_from_db(rankings, statements)

        for statement in statements:
            statement.social_ranking = social_rankings.get(statement.id)

        self.db.commit()

    def get_agent_status(self, deliberation: Deliberation, agent: Agent) -> dict:
        """Get the per-agent participation status for a continuous deliberation."""
        has_opinion = self.db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.agent_id == agent.id,
            )
        ).first() is not None

        has_ranking = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.agent_id == agent.id,
                Ranking.round_number == 0,
            )
        ).first() is not None

        statements_added = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.contributed_by_agent_id == agent.id,
            )
        ).count()

        total_statements = self.db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).count()

        can_add_statement = (
            has_opinion
            and has_ranking
            and statements_added < settings.CONTINUOUS_MAX_STATEMENTS_PER_AGENT
            and total_statements < settings.CONTINUOUS_MAX_STATEMENTS
        )

        # First-time participants should propose a consensus statement
        should_add_statement = (
            has_opinion
            and has_ranking
            and statements_added == 0
            and can_add_statement
        )

        # Check if agent has any predicted rankings
        has_predicted = False
        if has_ranking:
            ranking = self.db.query(Ranking).filter(
                and_(
                    Ranking.deliberation_id == deliberation.id,
                    Ranking.agent_id == agent.id,
                    Ranking.round_number == 0,
                )
            ).first()
            if ranking:
                has_predicted = any(
                    entry.get("is_predicted", False)
                    for entry in ranking.statement_rankings
                )

        return {
            "has_opinion": has_opinion,
            "has_ranking": has_ranking,
            "statements_added": statements_added,
            "can_add_statement": can_add_statement,
            "should_add_statement": should_add_statement,
            "has_predicted_rankings": has_predicted,
        }

    def get_current_winner(self, deliberation: Deliberation) -> Optional[Statement]:
        """Get the current winning statement."""
        return self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.social_ranking == 1,
            )
        ).first()

    def get_all_statements(self, deliberation: Deliberation) -> List[Statement]:
        """Get all statements in the pool."""
        return self.db.query(Statement).filter(
            Statement.deliberation_id == deliberation.id
        ).all()
