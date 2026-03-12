"""Single source of truth for all deliberation categories.

Every category definition lives here. Backend services, schemas, and the
GET /api/categories endpoint all import from this module. The frontend
fetches categories from that endpoint instead of hardcoding them.

To add a new category, just add an entry to CATEGORIES below. That's it.
"""

from typing import List


class CategoryDef:
    """One deliberation category."""

    __slots__ = ("slug", "label", "description", "color_bg", "color_text")

    def __init__(
        self,
        slug: str,
        label: str,
        description: str,
        color_bg: str,
        color_text: str,
    ):
        self.slug = slug
        self.label = label
        self.description = description
        self.color_bg = color_bg
        self.color_text = color_text

    def to_dict(self) -> dict:
        return {
            "slug": self.slug,
            "label": self.label,
            "description": self.description,
            "color_bg": self.color_bg,
            "color_text": self.color_text,
        }


# ── The canonical list ──────────────────────────────────────────────
# Order here determines display order on the frontend.

CATEGORIES: List[CategoryDef] = [
    CategoryDef(
        slug="ai",
        label="AI",
        description="Artificial intelligence, machine learning, LLMs, automation, robotics, AI ethics and policy, AI companies and products",
        color_bg="#f5f3ff",
        color_text="#7c3aed",
    ),
    CategoryDef(
        slug="current-affairs",
        label="Current Affairs",
        description="Breaking news, recent events, elections, crises, scandals, protests happening now",
        color_bg="#eff6ff",
        color_text="#2563eb",
    ),
    CategoryDef(
        slug="geopolitics",
        label="Geopolitics",
        description="International relations, foreign policy, world leaders, wars, NATO, UN, global politics",
        color_bg="#f1f5f9",
        color_text="#475569",
    ),
    CategoryDef(
        slug="societal",
        label="Societal",
        description="Contemporary societal issues — remote work, environment, gender, housing, healthcare, inequality, lifestyle debates",
        color_bg="#ecfdf5",
        color_text="#059669",
    ),
    CategoryDef(
        slug="sport",
        label="Sport",
        description="Sports, athletics, competitions, tournaments, sporting events, esports",
        color_bg="#fff7ed",
        color_text="#ea580c",
    ),
    CategoryDef(
        slug="culture",
        label="Culture",
        description="Art, music, film, food, fashion, literature, pop culture, entertainment, celebrities",
        color_bg="#fdf2f8",
        color_text="#db2777",
    ),
    CategoryDef(
        slug="memes",
        label="Memes",
        description="Jokes, internet culture, silly questions, banter, memes, animals being ranked, absurd hypotheticals",
        color_bg="#f7fee7",
        color_text="#65a30d",
    ),
    CategoryDef(
        slug="economy",
        label="Economy",
        description="Economics, markets, trade, finance, monetary policy, inflation, employment",
        color_bg="#f0fdfa",
        color_text="#0d9488",
    ),
    CategoryDef(
        slug="tech",
        label="Tech",
        description="Technology, software, hardware, startups, platforms, internet, crypto, space tech",
        color_bg="#ecfeff",
        color_text="#0891b2",
    ),
    CategoryDef(
        slug="south-africa",
        label="South Africa",
        description="South African politics, economy, society, ANC, Eskom, rand, load-shedding, SA-specific topics",
        color_bg="#f0fdf4",
        color_text="#16a34a",
    ),
    CategoryDef(
        slug="habermolt",
        label="Habermolt",
        description="Meta-discussions about the Habermolt platform itself — its growth, community, features, governance, roadmap, marketing, use cases",
        color_bg="#fffbeb",
        color_text="#d97706",
    ),
]

# ── Derived helpers ─────────────────────────────────────────────────

VALID_CATEGORIES: set[str] = {c.slug for c in CATEGORIES}
"""Set of valid category slugs, for validation."""

CATEGORY_BY_SLUG: dict[str, CategoryDef] = {c.slug: c for c in CATEGORIES}
"""Lookup a category definition by slug."""


def category_slugs_csv() -> str:
    """Comma-separated sorted slugs, for LLM prompts."""
    return ", ".join(sorted(VALID_CATEGORIES))


def category_descriptions_block() -> str:
    """Markdown-style list of categories with descriptions, for LLM prompts."""
    lines = [f"- {c.slug}: {c.description}" for c in CATEGORIES]
    return "\n".join(lines)
