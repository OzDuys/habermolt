"""
Grounding log service — records every human grounding interaction for research.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.grounding_log import GroundingLog

logger = logging.getLogger(__name__)


def log_event(
    db: Session,
    user_id: str,
    event_type: str,
    *,
    agent_id: Optional[UUID] = None,
    hosted_agent_id: Optional[UUID] = None,
    notification_id: Optional[UUID] = None,
    deliberation_id: Optional[UUID] = None,
    opinion_id: Optional[UUID] = None,
    input_text: Optional[str] = None,
    output_text: Optional[str] = None,
    opinion_text_before: Optional[str] = None,
    opinion_text_after: Optional[str] = None,
    profile_version_before: Optional[int] = None,
    profile_version_after: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> GroundingLog:
    """Append one event to the grounding audit trail."""
    entry = GroundingLog(
        user_id=user_id,
        agent_id=agent_id,
        hosted_agent_id=hosted_agent_id,
        event_type=event_type,
        notification_id=notification_id,
        deliberation_id=deliberation_id,
        opinion_id=opinion_id,
        input_text=input_text,
        output_text=output_text,
        opinion_text_before=opinion_text_before,
        opinion_text_after=opinion_text_after,
        profile_version_before=profile_version_before,
        profile_version_after=profile_version_after,
        metadata_=metadata,
    )
    db.add(entry)
    # Don't commit — let the caller's transaction handle it
    db.flush()
    return entry
