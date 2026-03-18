"""
Resolve short ID prefixes to full UUIDs.

LLM agents often truncate UUIDs to save tokens. This module resolves
any unambiguous prefix (min 4 hex chars) to the full UUID.
"""

from typing import Dict, List
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Deliberation, Statement


def resolve_deliberation_id(db: Session, short_id: str) -> UUID:
    """Resolve a deliberation ID prefix to a full UUID.

    Args:
        db: Database session
        short_id: Deliberation ID prefix (or full UUID), min 4 hex chars

    Returns:
        The full UUID of the matched deliberation

    Raises:
        ValueError: If the ID matches 0 or 2+ deliberations
    """
    clean = short_id.replace("-", "").lower()
    if len(clean) < 4:
        raise ValueError("Deliberation ID must be at least 4 characters")
    if not all(c in "0123456789abcdef" for c in clean):
        raise ValueError("Deliberation ID must be a hex string")

    # Try exact UUID parse first (fast path for full UUIDs)
    if len(clean) == 32:
        try:
            full_uuid = UUID(clean)
            delib = db.query(Deliberation).filter(Deliberation.id == full_uuid).first()
            if delib:
                return delib.id
        except ValueError:
            pass

    # Prefix match via CAST + LIKE in SQL
    from sqlalchemy import cast, String, func
    hex_id = db.query(
        Deliberation.id,
        func.replace(cast(Deliberation.id, String), "-", "").label("hex_id"),
    ).subquery()

    matches = (
        db.query(hex_id.c.id)
        .filter(hex_id.c.hex_id.like(f"{clean}%"))
        .all()
    )

    if len(matches) == 0:
        raise ValueError(f"Deliberation ID '{short_id}' not found")
    if len(matches) > 1:
        raise ValueError(
            f"Deliberation ID prefix '{short_id}' is ambiguous — matches {len(matches)} deliberations. "
            f"Use a longer prefix."
        )
    return matches[0][0]


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
