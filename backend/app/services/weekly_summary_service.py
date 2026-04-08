"""
Weekly summary aggregation for hosted agents.

Collects agent activity over the past 7 days for the weekly summary email.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.deliberation import Deliberation
from app.models.notification import Notification
from app.models.opinion import Opinion
from app.models.ranking import Ranking
from app.models.statement import Statement

logger = logging.getLogger(__name__)


def get_pending_review_count(db: Session, user_id: str) -> int:
    """Count notifications that haven't been approved or disapproved."""
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == "agent_action",
            Notification.approval_status.is_(None),
            Notification.metadata_["reviewable"].astext == "true",
        )
        .count()
    )


def get_weekly_summary(db: Session, agent_id: str, user_id: str | None = None) -> dict:
    """Aggregate agent activity for the past 7 days.

    Returns a dict with:
      - deliberations_joined: list of {question, deliberation_id}
      - opinions_count: int
      - rankings_count: int
      - statements_proposed: int
      - consensus_wins: list of {question, statement_title}
      - opinion_actions: list of {question, opinion_text, deliberation_id}
      - statement_actions: list of {question, statement_title, statement_text, deliberation_id}
      - pending_review_count: int
      - is_empty: bool
    """
    cutoff = datetime.utcnow() - timedelta(days=7)

    # Deliberations joined (opinions submitted in the period)
    opinions = (
        db.query(Opinion.deliberation_id, Deliberation.question)
        .join(Deliberation, Deliberation.id == Opinion.deliberation_id)
        .filter(Opinion.agent_id == agent_id, Opinion.submitted_at >= cutoff)
        .all()
    )
    deliberations_joined = [
        {"deliberation_id": str(o.deliberation_id), "question": o.question}
        for o in opinions
    ]
    opinions_count = len(opinions)

    # Rankings submitted/updated
    rankings_count = (
        db.query(func.count(Ranking.id))
        .filter(Ranking.agent_id == agent_id, Ranking.submitted_at >= cutoff)
        .scalar()
    ) or 0

    # Statements proposed
    statements_proposed = (
        db.query(func.count(Statement.id))
        .filter(
            Statement.contributed_by_agent_id == agent_id,
            Statement.generated_at >= cutoff,
        )
        .scalar()
    ) or 0

    # Consensus wins (agent's statements currently ranked #1)
    wins = (
        db.query(Statement.title, Deliberation.question)
        .join(Deliberation, Deliberation.id == Statement.deliberation_id)
        .filter(
            Statement.contributed_by_agent_id == agent_id,
            Statement.social_ranking == 1,
        )
        .all()
    )
    consensus_wins = [
        {"statement_title": w.title, "question": w.question}
        for w in wins
    ]

    # Highlight: best-performing proposed statement (lowest social_ranking = best)
    highlight = None
    best_statement = (
        db.query(Statement.title, Statement.statement_text, Statement.social_ranking, Deliberation.question)
        .join(Deliberation, Deliberation.id == Statement.deliberation_id)
        .filter(
            Statement.contributed_by_agent_id == agent_id,
            Statement.is_evicted == False,
            Statement.social_ranking.isnot(None),
        )
        .order_by(Statement.social_ranking.asc())
        .first()
    )
    if best_statement:
        # Truncate statement text for the email
        text_snippet = best_statement.statement_text
        if len(text_snippet) > 150:
            text_snippet = text_snippet[:147] + "..."
        highlight = {
            "title": best_statement.title,
            "text": text_snippet,
            "rank": best_statement.social_ranking,
            "deliberation_question": best_statement.question,
        }

    # All deliberations the agent is currently participating in (for context)
    from app.models.agent import Agent
    all_deliberations = (
        db.query(Deliberation.question)
        .join(Opinion, Opinion.deliberation_id == Deliberation.id)
        .filter(Opinion.agent_id == agent_id)
        .distinct()
        .all()
    )
    active_deliberation_questions = [d.question for d in all_deliberations]

    # Collect recent opinions with text for the email (the hook)
    opinion_details = []
    for o in opinions:
        opinion_details.append({
            "deliberation_id": str(o.deliberation_id),
            "question": o.question,
            "opinion_text": o[0].opinion_text if hasattr(o, '__getitem__') else "",
        })

    # Re-query with full opinion text for email
    recent_opinions_with_text = (
        db.query(Opinion.opinion_text, Opinion.deliberation_id, Deliberation.question)
        .join(Deliberation, Deliberation.id == Opinion.deliberation_id)
        .filter(Opinion.agent_id == agent_id, Opinion.submitted_at >= cutoff)
        .all()
    )
    opinion_actions = [
        {
            "deliberation_id": str(row.deliberation_id),
            "question": row.question,
            "opinion_text": row.opinion_text[:300] if row.opinion_text else "",
        }
        for row in recent_opinions_with_text
    ]

    # Collect recent statement proposals with text
    recent_statements = (
        db.query(Statement.title, Statement.statement_text, Statement.deliberation_id, Deliberation.question)
        .join(Deliberation, Deliberation.id == Statement.deliberation_id)
        .filter(
            Statement.contributed_by_agent_id == agent_id,
            Statement.generated_at >= cutoff,
        )
        .all()
    )
    statement_actions = [
        {
            "deliberation_id": str(row.deliberation_id),
            "question": row.question,
            "statement_title": row.title,
            "statement_text": row.statement_text[:300] if row.statement_text else "",
        }
        for row in recent_statements
    ]

    # Pending review count
    pending_review = 0
    if user_id:
        pending_review = get_pending_review_count(db, user_id)

    is_empty = (
        opinions_count == 0
        and rankings_count == 0
        and statements_proposed == 0
        and len(consensus_wins) == 0
    )

    return {
        "deliberations_joined": deliberations_joined,
        "opinions_count": opinions_count,
        "rankings_count": rankings_count,
        "statements_proposed": statements_proposed,
        "consensus_wins": consensus_wins,
        "highlight": highlight,
        "active_deliberation_questions": active_deliberation_questions,
        "opinion_actions": opinion_actions,
        "statement_actions": statement_actions,
        "pending_review_count": pending_review,
        "is_empty": is_empty,
    }
