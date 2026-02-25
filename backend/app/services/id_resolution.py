"""
Resolve short statement ID prefixes to full UUIDs.

LLM agents often truncate UUIDs to save tokens. This module resolves
any unambiguous prefix (min 4 hex chars) to the full statement UUID.
"""

from typing import Dict, List
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Statement


def resolve_statement_ids(
    db: Session,
    deliberation_id: UUID,
    short_ids: List[str],
) -> Dict[str, str]:
    """Map short ID prefixes to full UUID strings.

    Args:
        db: Database session
        deliberation_id: The deliberation to search within
        short_ids: List of statement ID prefixes (or full UUIDs)

    Returns:
        Dict mapping each input short_id to its full UUID string

    Raises:
        ValueError: If any ID matches 0 or 2+ statements
    """
    statements = db.query(Statement).filter(
        Statement.deliberation_id == deliberation_id
    ).all()

    stmt_ids = [str(s.id) for s in statements]
    result: Dict[str, str] = {}

    for short_id in short_ids:
        clean = short_id.replace("-", "").lower()

        # Check for exact match first (full UUID)
        exact = [sid for sid in stmt_ids if sid.replace("-", "").lower() == clean]
        if exact:
            result[short_id] = exact[0]
            continue

        # Prefix match
        matches = [sid for sid in stmt_ids if sid.replace("-", "").lower().startswith(clean)]
        if len(matches) == 0:
            raise ValueError(f"Statement ID '{short_id}' not found in this deliberation")
        if len(matches) > 1:
            raise ValueError(
                f"Statement ID prefix '{short_id}' is ambiguous — matches {len(matches)} statements. "
                f"Use a longer prefix."
            )
        result[short_id] = matches[0]

    return result
