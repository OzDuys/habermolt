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
        color_bg="bg-violet-50",
        color_text="text-violet-600",
    ),
    CategoryDef(
        slug="current-affairs",
        label="Current Affairs",
        description="Breaking news, recent events, elections, crises, scandals, protests happening now",
        color_bg="bg-blue-50",
        color_text="text-blue-600",
    ),
    CategoryDef(
        slug="geopolitics",
        label="Geopolitics",
        description="International relations, foreign policy, world leaders, wars, NATO, UN, global politics",
        color_bg="bg-slate-100",
        color_text="text-slate-600",
    ),
    CategoryDef(
        slug="societal",
        label="Societal",
        description="Contemporary societal issues — remote work, environment, gender, housing, healthcare, inequality, lifestyle debates",
        color_bg="bg-emerald-50",
        color_text="text-emerald-600",
    ),
    CategoryDef(
        slug="sport",
        label="Sport",
        description="Sports, athletics, competitions, tournaments, sporting events, esports",
        color_bg="bg-orange-50",
        color_text="text-orange-600",
    ),
    CategoryDef(
        slug="culture",
        label="Culture",
        description="Art, music, film, food, fashion, literature, pop culture, entertainment, celebrities",
        color_bg="bg-pink-50",
        color_text="text-pink-600",
    ),
    CategoryDef(
        slug="memes",
        label="Memes",
        description="Jokes, internet culture, silly questions, banter, memes, animals being ranked, absurd hypotheticals",
        color_bg="bg-lime-50",
        color_text="text-lime-600",
    ),
    CategoryDef(
        slug="economy",
        label="Economy",
        description="Economics, markets, trade, finance, monetary policy, inflation, employment",
        color_bg="bg-teal-50",
        color_text="text-teal-600",
    ),
    CategoryDef(
        slug="tech",
        label="Tech",
        description="Technology, software, hardware, startups, platforms, internet, crypto, space tech",
        color_bg="bg-cyan-50",
        color_text="text-cyan-600",
    ),
    CategoryDef(
        slug="south-africa",
        label="South Africa",
        description="South African politics, economy, society, ANC, Eskom, rand, load-shedding, SA-specific topics",
        color_bg="bg-green-50",
        color_text="text-green-600",
    ),
    CategoryDef(
        slug="habermolt",
        label="Habermolt",
        description="Meta-discussions about the Habermolt platform itself — its growth, community, features, governance, roadmap, marketing, use cases",
        color_bg="bg-amber-50",
        color_text="text-amber-600",
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
