"""
Service for generating candidate consensus statements using Gemini.

Replaces the statement generation part of the Habermas Machine.
Prompts are adapted from habermas_machine/statement_model/cot_model.py.
"""

import asyncio
import logging
import random
import re
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Deliberation, Statement
from app.services.gemini_client import LLMClient

logger = logging.getLogger(__name__)


def _generate_opinion_only_prompt(
    question: str,
    opinions: list[str],
) -> str:
    """Generates a prompt for initial consensus statement from opinions only."""
    prompt = f"""
You are assisting a citizens' jury in forming an initial consensus opinion on an important question. The jury members have provided their individual opinions. Your role is to generate a draft consensus statement that captures the main points of agreement and represents the collective view of the jury.  The draft statement must not conflict with any of the individual opinions.

Please think through this task step-by-step:

1. Carefully analyze the individual opinions, noting key themes, points of agreement, and areas of disagreement.
2. Based on the analysis, synthesize a concise and clear consensus statement that represents the shared perspective of the jury members.  Address the core issue posed in the question, and ensure the statement *does not conflict* with any of the individual opinions.  Refer to specific opinion numbers to demonstrate how the draft reflects the collective view.

Provide your answer in the following format:
<answer>
[Your step-by-step reasoning and explanation for the statement]
<sep>
[Draft consensus statement]
</answer>

Example:
<answer>
1. Most opinions emphasize the importance of public transportation (Opinions 1, 3, 4) and reducing car dependency (Opinions 2, 4). Some also mention cycling and walking as important additions (Opinions 2, 3).
2. The draft statement prioritizes investment in public transport and encourages cycling and walking, reflecting the shared views expressed in the majority of opinions.
<sep>
We believe that investing in public transport, along with promoting cycling and walking, are crucial steps towards creating a more sustainable and livable city.
</answer>


Below you will find the question and the individual opinions of the jury members.

Question: {question}

Individual Opinions:
"""
    for i, opinion in enumerate(opinions):
        prompt += f"Opinion Person {i+1}: {opinion}\n"

    return prompt.strip()


def _generate_opinion_critique_prompt(
    question: str,
    opinions: list[str],
    previous_winner: str,
    critiques: list[str],
) -> str:
    """Generates a prompt for revised consensus statement using opinions and critiques."""
    prompt = f"""You are assisting a citizens' jury in forming a consensus opinion on an important question. The jury members have provided their individual opinions, a first draft of a consensus statement was created, and critiques of that draft were gathered. Your role is to generate a revised consensus statement that incorporates the feedback and aims to better represent the collective view of the jury.  Ensure the revised statement does not conflict with the individual opinions.

Please think through this task step-by-step:

1. Carefully analyze the individual opinions, noting key themes, points of agreement, and areas of disagreement.
2. Review the previous draft consensus statement and identify its strengths and weaknesses.
3. Analyze the critiques of the previous draft, paying attention to specific suggestions and concerns raised by the jury members.
4. Based on the opinions, the previous draft, and the critiques, synthesize a revised consensus statement that addresses the concerns raised and better reflects the collective view of the jury. Ensure the statement is clear, concise, addresses the core issue posed in the question, and *does not conflict* with any of the individual opinions.  Refer to specific opinion and critique numbers when making your revisions.

Provide your answer in the following format:
<answer>
[Your step-by-step reasoning and explanation for the revised statement]
<sep>
[Revised consensus statement]
</answer>

Example:
<answer>
1. Opinions generally agree on the need for more green spaces (Opinions 1, 2, 3), but disagree on the specific location (Opinions 2 and 3 prefer the riverfront) and funding (Opinion 1 suggests a tax levy, Opinion 3 suggests private donations).
2. The previous draft suggested converting the old factory site into a park, but didn't address funding, which was a key concern in Critique 1.
3. Critiques highlighted the lack of funding details (Critique 1) and some preferred a different location (Critique 2 suggested the riverfront, echoing Opinion 2).
4. The revised statement proposes converting the old factory site into a park, funded by a combination of city funds and private donations (addressing Opinion 3 and Critique 1), and includes a plan for community input on park design and amenities. The factory site is chosen as a compromise location, as it avoids the higher costs associated with the riverfront development suggested in Opinion 2 and Critique 2.
<sep>
We propose converting the old factory site into a park, funded by a combination of city funds and private donations. We will actively seek community input on the park's design and amenities to ensure it meets the needs of our residents.
</answer>


Below you will find the question, the individual opinions, the previous draft consensus statement, and the critiques provided by the jury members.


Question: {question}

Individual Opinions:
"""
    for i, opinion in enumerate(opinions):
        prompt += f"Opinion Person {i+1}: {opinion}\n"

    prompt += f"""
Previous Draft Consensus Statement: {previous_winner}

Critiques of the Previous Draft:
"""
    for i, critique in enumerate(critiques):
        prompt += f"Critique Person {i+1}: {critique}\n"

    return prompt.strip()


def _process_model_response(response: str) -> Tuple[str, str]:
    """Extracts statement and explanation from <answer>...<sep>...</answer> format.

    Returns:
        (statement, explanation). If format is wrong, returns ("", "INCORRECT_TEMPLATE").
    """
    match = re.search(
        r"<answer>\s*(.*?)\s*<sep>\s*(.*?)\s*</answer>", response, re.DOTALL
    )
    if match:
        explanation = match.group(1).strip()
        statement = match.group(2).strip()
        return statement, explanation
    else:
        return "", "INCORRECT_TEMPLATE"


class StatementService:
    """Generates candidate group statements by calling Gemini."""

    def __init__(self):
        self.num_candidates = settings.HABERMAS_NUM_CANDIDATES
        self.num_retries = settings.HABERMAS_NUM_RETRIES
        self.client = LLMClient()

    def _generate_single_statement(
        self,
        question: str,
        opinions: list[str],
        previous_winner: Optional[str] = None,
        critiques: Optional[list[str]] = None,
    ) -> Tuple[str, str]:
        """Generate one candidate statement with retries. Returns (statement, explanation)."""
        # Shuffle opinions (and critiques) to avoid ordering bias, same as HM
        indices = list(range(len(opinions)))
        random.shuffle(indices)
        shuffled_opinions = [opinions[i] for i in indices]
        shuffled_critiques = [critiques[i] for i in indices] if critiques else None

        if previous_winner and shuffled_critiques:
            prompt = _generate_opinion_critique_prompt(
                question, shuffled_opinions, previous_winner, shuffled_critiques
            )
        else:
            prompt = _generate_opinion_only_prompt(question, shuffled_opinions)

        statement, explanation = "", ""
        for attempt in range(self.num_retries):
            response = self.client.sample_text(
                prompt, stop_sequences=["</answer>"]
            )
            statement, explanation = _process_model_response(response)
            if len(statement) > 5 and "INCORRECT" not in explanation:
                return statement, explanation
            else:
                logger.warning(
                    f"Statement generation attempt {attempt + 1}/{self.num_retries} "
                    f"failed: {explanation[:100]}"
                )

        return statement, explanation

    async def generate_statements(
        self,
        db: Session,
        deliberation: Deliberation,
        opinions: list[str],
        round_number: int,
        previous_winner: Optional[str] = None,
        critiques: Optional[list[str]] = None,
    ) -> List[Statement]:
        """
        Generate num_candidates statements and store them in the database.

        Statements are saved with social_ranking=None — the ranking is determined
        later by the Schulze method after agents submit their rankings.

        Returns list of Statement model instances.
        """
        def _generate_all():
            results = []
            for i in range(self.num_candidates):
                logger.info(
                    f"Generating statement {i + 1}/{self.num_candidates} "
                    f"for deliberation {deliberation.id}"
                )
                stmt, expl = self._generate_single_statement(
                    deliberation.question, opinions, previous_winner, critiques
                )
                results.append((stmt, expl))
            return results

        # Run blocking LLM calls in thread pool
        results = await asyncio.to_thread(_generate_all)

        # Store in database — social_ranking is NULL at this point
        statements = []
        for stmt_text, explanation in results:
            if stmt_text:  # Skip empty statements from failed generations
                statement = Statement(
                    deliberation_id=deliberation.id,
                    round_number=round_number,
                    statement_text=stmt_text,
                    social_ranking=None,
                    meta_data={"explanation": explanation},
                )
                db.add(statement)
                statements.append(statement)

        db.commit()

        logger.info(
            f"Generated {len(statements)} statements for deliberation "
            f"{deliberation.id} round {round_number}"
        )
        return statements


# Global service instance
statement_service = StatementService()
