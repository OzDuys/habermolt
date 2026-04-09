"""
Grounding log — append-only audit trail for every human grounding interaction.

Captures: approvals, disapprovals, critiques, revisions, edits, withdrawals,
profile updates. This is research data for analyzing how humans ground their
AI agents' behavior over time.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class GroundingLog(Base):
    __tablename__ = "grounding_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Who
    user_id = Column(String, nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True)
    hosted_agent_id = Column(UUID(as_uuid=True), ForeignKey("hosted_agents.id"), nullable=True)

    # What
    event_type = Column(String(50), nullable=False, index=True)
    # Event types:
    #   "approve"           — user approved an agent action as-is
    #   "disapprove"        — user disapproved (with reason)
    #   "critique"          — user submitted a critique for revision
    #   "revision_generated"— LLM generated a revised opinion from critique
    #   "edit"              — user manually edited an opinion
    #   "save"              — user saved a revised/edited opinion (final approval)
    #   "withdraw"          — user withdrew from a deliberation
    #   "profile_updated"   — agent profile was updated from approval/critique

    # Context
    notification_id = Column(UUID(as_uuid=True), ForeignKey("notifications.id"), nullable=True)
    deliberation_id = Column(UUID(as_uuid=True), ForeignKey("deliberations.id"), nullable=True)
    opinion_id = Column(UUID(as_uuid=True), ForeignKey("opinions.id"), nullable=True)

    # Content — what was the human's input/the system's output
    input_text = Column(Text, nullable=True)
    # For critique: the critique text
    # For edit: the edited opinion text
    # For disapprove: the disapproval reason
    # For approve: null (no input needed)

    output_text = Column(Text, nullable=True)
    # For revision_generated: the LLM-generated revised opinion
    # For profile_updated: the extracted value statement / preference lesson
    # For others: null

    # Snapshot of state at time of event
    opinion_text_before = Column(Text, nullable=True)  # opinion text before this action
    opinion_text_after = Column(Text, nullable=True)   # opinion text after this action
    profile_version_before = Column(Integer, nullable=True)
    profile_version_after = Column(Integer, nullable=True)

    # Extra structured data
    metadata_ = Column("metadata", JSONB, nullable=True)
    # For critique: {"critique_number": 2, "critiques_so_far": ["first critique", "second critique"]}
    # For save: {"source": "human_edit"|"revision", "total_critiques": 3, "all_critiques": [...]}
    # For withdraw: {"statements_anonymized": 2, "opinions_deleted": 1}
    # For profile_updated: {"trigger": "approval"|"save_with_critiques", "profile_diff_length": 42}

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
