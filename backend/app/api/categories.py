"""API route for deliberation categories.

Returns the canonical list of categories from the single source of truth
so the frontend (and agents) never need to hardcode them.
"""

from fastapi import APIRouter

from app.categories import CATEGORIES

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
def list_categories():
    """Return all valid deliberation categories with labels, descriptions, and colors."""
    return [c.to_dict() for c in CATEGORIES]
