"""Categorization service — assigns topic categories to deliberations using an LLM.

Categories are defined in app.categories (single source of truth).

A deliberation may belong to multiple categories. The LLM returns a
comma-separated list of matching slugs, or "none" if nothing fits.

Called as a background task after deliberation creation (when the agent doesn't
supply categories) and on startup to back-fill any existing uncategorised rows.
"""

import logging
from typing import List

from app.categories import VALID_CATEGORIES, category_slugs_csv, category_descriptions_block
from app.models import Deliberation
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

_VALID_TOKENS = category_slugs_csv() + ", none"

_SYSTEM_PROMPT = f"""\
You are a topic classifier. Classify deliberation questions into one or more categories.
Reply with ONLY a comma-separated list of matching slugs from: {_VALID_TOKENS}.
Use "none" only if no category fits. No explanation, nothing else."""

_USER_TEMPLATE = f"""\
Categories:
{category_descriptions_block()}

Question: "{{question}}"

Reply with a comma-separated list of matching slugs (e.g. "ai, societal") or "none":"""


def classify_question(question: str) -> List[str]:
    """Use an LLM to assign one or more categories to a deliberation question.

    Returns a list of category slugs, or an empty list if no category fits.
    """
    client = LLMClient()
    client.set_trace_context(trace_type="categorization")

    raw = client.sample_text(
        prompt=_USER_TEMPLATE.format(question=question),
        system_prompt=_SYSTEM_PROMPT,
        temperature=0.0,
        max_tokens=32,
    ).strip().lower()

    # Parse comma-separated tokens, strip punctuation, filter to valid slugs
    tokens = [t.strip().rstrip(".,;:") for t in raw.split(",") if t.strip()]
    categories = [t for t in tokens if t in VALID_CATEGORIES]
    return categories


def categorize_deliberation(deliberation_id: str) -> None:
    """Background task: fetch one deliberation and assign its categories if missing.

    Opens its own DB session so it's safe to call from a background thread or
    FastAPI BackgroundTasks.
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        delib = db.query(Deliberation).filter(
            Deliberation.id == deliberation_id
        ).first()

        if not delib:
            logger.warning(f"[categorize] Deliberation {deliberation_id} not found")
            return

        if delib.categories:
            return  # Already categorised — nothing to do

        categories = classify_question(delib.question)
        delib.categories = categories  # empty list is fine; stays uncategorised
        db.commit()
        logger.info(
            f"[categorize] Deliberation {deliberation_id} → {categories!r}"
        )
    except Exception as exc:
        logger.error(
            f"[categorize] Failed for {deliberation_id}: {exc}", exc_info=True
        )
        db.rollback()
    finally:
        db.close()


def backfill_uncategorized() -> None:
    """Categorise every deliberation that currently has no categories set.

    Idempotent: only processes rows where categories IS NULL or is an empty
    array. Safe to call on every server restart.

    Intended to be called once at startup in a daemon thread so it doesn't
    block the server from accepting requests.
    """
    from app.database import SessionLocal
    from sqlalchemy import or_, func

    db = SessionLocal()
    try:
        uncategorized = (
            db.query(Deliberation)
            .filter(
                or_(
                    Deliberation.categories.is_(None),
                    func.cardinality(Deliberation.categories) == 0,
                )
            )
            .all()
        )
        ids = [str(d.id) for d in uncategorized]
    finally:
        db.close()

    if not ids:
        logger.info("[categorize] No uncategorised deliberations to back-fill.")
        return

    logger.info(f"[categorize] Back-filling {len(ids)} uncategorised deliberation(s)…")
    for deliberation_id in ids:
        categorize_deliberation(deliberation_id)
    logger.info("[categorize] Back-fill complete.")
