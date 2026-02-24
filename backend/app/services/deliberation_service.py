"""
Deliberation service - state machine logic for managing deliberation lifecycle.

Handles transitions between the five stages:
OPINION → RANKING → CRITIQUE → CONCLUDED → FINALIZED
"""

from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models import (
    Deliberation,
    DeliberationStage,
    Agent,
    Opinion,
    Ranking,
    Critique,
    HumanFeedback,
    Statement,
)
from app.config import settings
from app.services.statement_service import statement_service
from app.services.schulze_service import schulze_service


class DeliberationService:
    """
    Service for managing deliberation state machine and transitions.

    Automatically handles state transitions when all required submissions
    are received for each stage.
    """

    def __init__(self, db: Session):
        """
        Initialize deliberation service.

        Args:
            db: Database session
        """
        self.db = db

    # Join window duration in seconds (5 minutes)
    JOIN_WINDOW_SECONDS = 300

    def create_deliberation(
        self,
        question: str,
        creator_agent: Agent,
        num_critique_rounds: int = 1,
        categories: list = None,
        meta_data: dict = None
    ) -> Deliberation:
        """
        Create a new deliberation.

        Args:
            question: The question to deliberate on
            creator_agent: The agent creating the deliberation
            num_critique_rounds: Number of critique rounds (default 1)
            categories: Optional list of topic categories (e.g. ['ai', 'societal'])
            meta_data: Optional metadata dictionary

        Returns:
            Created Deliberation instance
        """
        deliberation = Deliberation(
            question=question,
            stage=DeliberationStage.OPINION,
            created_by_agent_id=creator_agent.id,
            num_citizens=0,
            num_critique_rounds=num_critique_rounds,
            current_critique_round=0,
            categories=categories or [],
            meta_data=meta_data or {}
        )

        self.db.add(deliberation)
        self.db.commit()
        self.db.refresh(deliberation)

        return deliberation

    def get_participating_agents(self, deliberation: Deliberation) -> List[Agent]:
        """
        Get all agents participating in a deliberation.

        An agent is considered participating if they've submitted an opinion.

        Args:
            deliberation: The deliberation instance

        Returns:
            List of participating Agent instances
        """
        agent_ids = [opinion.agent_id for opinion in deliberation.opinions]
        agents = self.db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
        return agents

    async def check_and_transition_state(self, deliberation: Deliberation) -> bool:
        """
        Check if deliberation should transition to next stage and perform transition.

        This is the core state machine logic. Called after each submission.

        Args:
            deliberation: The deliberation to check

        Returns:
            bool: True if a transition occurred, False otherwise
        """
        # Refresh to get latest data
        self.db.refresh(deliberation)

        if deliberation.stage == DeliberationStage.OPINION:
            return await self._check_opinion_to_ranking_transition(deliberation)

        elif deliberation.stage == DeliberationStage.RANKING:
            return await self._check_ranking_transition(deliberation)

        elif deliberation.stage == DeliberationStage.CRITIQUE:
            return await self._check_critique_transition(deliberation)

        elif deliberation.stage == DeliberationStage.CONCLUDED:
            return self._check_concluded_to_finalized_transition(deliberation)

        return False

    async def _check_opinion_to_ranking_transition(self, deliberation: Deliberation) -> bool:
        """
        Check if the join window has expired and transition to RANKING stage.

        The 5-minute join window starts when the 2nd opinion arrives.
        Transition happens when the window expires OR when the creator
        manually starts via start_deliberation().

        Args:
            deliberation: The deliberation instance

        Returns:
            bool: True if transition occurred
        """
        if len(deliberation.opinions) < 2:
            return False

        # Start the join window when we first hit 2 opinions
        if deliberation.join_window_deadline is None:
            deliberation.join_window_deadline = datetime.utcnow() + timedelta(seconds=self.JOIN_WINDOW_SECONDS)
            self.db.commit()
            return False

        # Window still open — don't transition yet
        if datetime.utcnow() < deliberation.join_window_deadline:
            return False

        # Window expired — transition to RANKING
        return await self._transition_to_ranking(deliberation)

    async def _transition_to_ranking(self, deliberation: Deliberation) -> bool:
        """
        Execute the OPINION → RANKING transition: generate statements and update state.

        Args:
            deliberation: The deliberation instance

        Returns:
            bool: True if transition occurred
        """
        # Signal that statement generation is in progress
        deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': True}
        self.db.commit()

        opinions_text = [opinion.opinion_text for opinion in deliberation.opinions]

        try:
            statements = await statement_service.generate_statements(
                self.db,
                deliberation,
                opinions_text,
                round_number=0,
            )
        except Exception:
            deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}
            self.db.commit()
            raise

        if not statements:
            deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}
            self.db.commit()
            raise ValueError("Failed to generate any candidate statements")

        deliberation.stage = DeliberationStage.RANKING
        deliberation.num_citizens = len(deliberation.opinions)
        deliberation.started_at = datetime.utcnow()
        deliberation.updated_at = datetime.utcnow()
        deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}

        self.db.commit()

        return True

    async def start_deliberation(self, deliberation: Deliberation, agent: Agent) -> bool:
        """
        Manually start the deliberation (skip remaining join window).

        Only the creator agent can call this. Requires at least 2 opinions.

        Args:
            deliberation: The deliberation instance
            agent: The agent requesting the start

        Returns:
            bool: True if transition occurred

        Raises:
            ValueError: If preconditions are not met
            PermissionError: If agent is not the creator
        """
        if agent.id != deliberation.created_by_agent_id:
            raise PermissionError("Only the creator can start the deliberation")

        if deliberation.stage != DeliberationStage.OPINION:
            raise ValueError(f"Deliberation is in {deliberation.stage} stage, not opinion")

        if len(deliberation.opinions) < 2:
            raise ValueError("Need at least 2 participants to start")

        return await self._transition_to_ranking(deliberation)

    async def _check_ranking_transition(self, deliberation: Deliberation) -> bool:
        """
        Check if all rankings are submitted, run Schulze election, then transition.

        Transitions to CRITIQUE if critique is enabled, otherwise straight to CONCLUDED.

        Args:
            deliberation: The deliberation instance

        Returns:
            bool: True if transition occurred
        """
        # Get rankings for current round
        expected_rankings = deliberation.num_citizens
        db_rankings = self.db.query(Ranking).filter(
            and_(
                Ranking.deliberation_id == deliberation.id,
                Ranking.round_number == deliberation.current_critique_round
            )
        ).all()

        # Check if all agents have ranked
        if len(db_rankings) < expected_rankings:
            return False

        # Get statements for current round
        statements = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.round_number == deliberation.current_critique_round
            )
        ).all()

        # Run Schulze on agent-submitted rankings to determine winner
        social_rankings = schulze_service.aggregate_from_db(db_rankings, statements)

        # Update statements with social rankings
        for statement in statements:
            statement.social_ranking = social_rankings[statement.id]

        if settings.HABERMAS_CRITIQUE_ENABLED:
            deliberation.stage = DeliberationStage.CRITIQUE
        else:
            deliberation.stage = DeliberationStage.CONCLUDED
            deliberation.concluded_at = datetime.utcnow()

        deliberation.updated_at = datetime.utcnow()
        self.db.commit()

        return True

    async def _check_critique_transition(self, deliberation: Deliberation) -> bool:
        """
        Check if all critiques are submitted and either:
        - Generate new statements for another round (back to RANKING), or
        - Conclude the deliberation (to CONCLUDED)

        Args:
            deliberation: The deliberation instance

        Returns:
            bool: True if transition occurred
        """
        # Get critiques for current round
        expected_critiques = deliberation.num_citizens
        current_critiques = self.db.query(Critique).filter(
            and_(
                Critique.deliberation_id == deliberation.id,
                Critique.round_number == deliberation.current_critique_round
            )
        ).count()

        # Check if all agents have critiqued
        if current_critiques < expected_critiques:
            return False

        # All critiques collected - decide next step
        if deliberation.current_critique_round < deliberation.num_critique_rounds - 1:
            # Signal that statement generation is in progress
            deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': True}
            self.db.commit()

            # Get previous winning statement and critiques
            winner = self.get_winning_statement(deliberation)
            previous_winner_text = winner.statement_text if winner else None

            critiques_text = [c.critique_text for c in deliberation.critiques if c.round_number == deliberation.current_critique_round]
            opinions_text = [opinion.opinion_text for opinion in deliberation.opinions]

            # Increment round
            deliberation.current_critique_round += 1

            # Generate new candidate statements using critiques
            try:
                statements = await statement_service.generate_statements(
                    self.db,
                    deliberation,
                    opinions_text,
                    round_number=deliberation.current_critique_round,
                    previous_winner=previous_winner_text,
                    critiques=critiques_text,
                )
            except Exception:
                deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}
                self.db.commit()
                raise

            if not statements:
                deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}
                self.db.commit()
                raise ValueError("Failed to generate any candidate statements")

            # Back to ranking stage
            deliberation.stage = DeliberationStage.RANKING
            deliberation.updated_at = datetime.utcnow()
            deliberation.meta_data = {**(deliberation.meta_data or {}), 'processing': False}

        else:
            # Final round complete - conclude
            deliberation.stage = DeliberationStage.CONCLUDED
            deliberation.concluded_at = datetime.utcnow()
            deliberation.updated_at = datetime.utcnow()

        self.db.commit()

        return True

    def _check_concluded_to_finalized_transition(self, deliberation: Deliberation) -> bool:
        """
        Check if all human feedback is submitted and transition to FINALIZED stage.

        Args:
            deliberation: The deliberation instance

        Returns:
            bool: True if transition occurred
        """
        # Get feedback count
        expected_feedback = deliberation.num_citizens
        current_feedback = len(deliberation.human_feedback)

        # Check if all humans have provided feedback
        if current_feedback < expected_feedback:
            return False

        # All feedback collected - finalize
        deliberation.stage = DeliberationStage.FINALIZED
        deliberation.finalized_at = datetime.utcnow()
        deliberation.updated_at = datetime.utcnow()

        self.db.commit()

        return True

    def can_agent_participate(self, deliberation: Deliberation, agent: Agent) -> bool:
        """
        Check if an agent can participate in a deliberation.

        Args:
            deliberation: The deliberation instance
            agent: The agent to check

        Returns:
            bool: True if agent can participate
        """
        # Check if deliberation is accepting opinions
        if not deliberation.is_accepting_opinions():
            return False

        # Check if join window has expired
        if deliberation.join_window_deadline and datetime.utcnow() >= deliberation.join_window_deadline:
            return False

        # Check if agent already submitted opinion
        existing_opinion = self.db.query(Opinion).filter(
            and_(
                Opinion.deliberation_id == deliberation.id,
                Opinion.agent_id == agent.id
            )
        ).first()

        if existing_opinion:
            return False

        return True

    def get_current_statements(self, deliberation: Deliberation) -> List[Statement]:
        """
        Get the current round's statements for ranking.

        Args:
            deliberation: The deliberation instance

        Returns:
            List of Statement instances for current round
        """
        statements = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.round_number == deliberation.current_critique_round
            )
        ).all()

        return statements

    def get_winning_statement(self, deliberation: Deliberation) -> Optional[Statement]:
        """
        Get the winning statement for the current round.

        Args:
            deliberation: The deliberation instance

        Returns:
            Statement with social_ranking=1 for current round, or None
        """
        winner = self.db.query(Statement).filter(
            and_(
                Statement.deliberation_id == deliberation.id,
                Statement.round_number == deliberation.current_critique_round,
                Statement.social_ranking == 1
            )
        ).first()

        return winner
