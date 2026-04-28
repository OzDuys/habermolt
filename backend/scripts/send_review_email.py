"""
Send a single "review my agent" email to drive a human back to the inbox.

Picks the most provocative pending action from a user's inbox (one whose
opinion the human is most likely to disagree with) and emails them about it,
deep-linked to /inbox?notification_id=<id> so the review card scrolls into
view and pulses.

Usage:
    cd backend
    python scripts/send_review_email.py --email oscar@martinduys.com
    python scripts/send_review_email.py --email you@example.com --dry-run
    python scripts/send_review_email.py --email you@example.com --dry-run --no-llm

Flags:
    --email      Recipient (required)
    --dry-run    Don't send via Resend; write rendered HTML to /tmp and print path
    --no-llm     Skip the provocation-drafting LLM call (use a static template)
    --max-actions  How many actions to feature in the email (default 3)
    --notification-id  Force a specific notification (skip the heuristic picker)
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
import tempfile
import time
from datetime import datetime
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

# Load env before importing app.database (which reads DATABASE_URL at import time).
# Root .env may carry PRODUCTION_DATABASE_URL + the new LLM_API_KEY; backend/.env
# is the historical default. Root wins so the user can manage secrets in one place.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(_REPO_ROOT, ".env"), override=True)
load_dotenv()  # backend/.env — fills in anything root didn't define
# RESEND_API_KEY lives in the Next.js app's .env.local since the auth flow
# (welcome / password reset emails) runs on the frontend. Pick it up so this
# backend script doesn't need a duplicate copy.
load_dotenv(os.path.join(_REPO_ROOT, "frontend", ".env.local"))

# If --prod is on the command line, swap DATABASE_URL + FRONTEND_URL to
# their production values before app.config / app.database are imported.
# (Argparse runs later in main().)
#
# CRITICAL: FRONTEND_URL defaults to http://localhost:3000 in app/config.py.
# If we forget to set it, the email links go to localhost — which is what
# happened on 2026-04-28's broadcast and required a correction email. Always
# pin the production frontend URL here when --prod is used.
if "--prod" in sys.argv:
    prod_url = os.environ.get("PRODUCTION_DATABASE_URL")
    if not prod_url:
        print("ERROR: --prod requested but PRODUCTION_DATABASE_URL is not set "
              "in the root .env file.", file=sys.stderr)
        sys.exit(1)
    os.environ["DATABASE_URL"] = prod_url
    # Hard-pin so any bug in env loading can't silently emit localhost links.
    os.environ["FRONTEND_URL"] = os.environ.get(
        "PRODUCTION_FRONTEND_URL", "https://habermolt.com"
    )

import resend
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.deliberation import Deliberation
from app.models.notification import Notification
from app.services.email_service import (
    BRAND_COLOR,
    FROM_ADDRESS,
    _email_wrapper,
    get_or_create_email_preference,
)
from app.services.llm_client import LLMClient, sanitize_prompt_text

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("send_review_email")


# Joining a deliberation (and stating an opinion in the user's name) is the
# most common autonomous action — so it's the highest-yield nudge to pick.
# Opinion updates are rarer; create_deliberation is rarer still.
ACTION_PRIORITY = {
    "join_deliberation": 0,
    "update_opinion": 1,
    "revisit_opinion": 1,
    "create_deliberation": 2,
}


def find_user_by_email(db: Session, email: str) -> Optional[dict]:
    row = db.execute(
        text('SELECT id, name, email FROM "user" WHERE lower(email) = lower(:e)'),
        {"e": email},
    ).fetchone()
    if not row:
        return None
    return {"id": row[0], "name": row[1] or "there", "email": row[2]}


def fetch_candidates(
    db: Session, user_id: str, nudge_cooldown_days: int = 0
) -> list[Notification]:
    """All reviewable+unapproved notifications for a user, recency desc.

    If nudge_cooldown_days > 0, filter out notifications already nudged
    within the last N days so we don't email the same user about the same
    action repeatedly.
    """
    q = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.type == "agent_action",
            Notification.approval_status.is_(None),
            Notification.metadata_["reviewable"].astext == "true",
        )
    )
    if nudge_cooldown_days > 0:
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=nudge_cooldown_days)
        q = q.filter(
            (Notification.review_nudge_sent_at.is_(None))
            | (Notification.review_nudge_sent_at < cutoff)
        )
    return q.order_by(Notification.created_at.desc()).all()


def heuristic_pick(
    candidates: list[Notification], limit: int
) -> tuple[list[Notification], int]:
    """Fallback when LLM scoring is unavailable: priority + recency."""
    if not candidates:
        return [], 0
    ordered = sorted(
        candidates,
        key=lambda n: (
            ACTION_PRIORITY.get((n.metadata_ or {}).get("action_type", ""), 99),
            -int(n.created_at.timestamp()),
        ),
    )
    return ordered[:limit], max(0, len(ordered) - limit)


def get_user_profile(db: Session, user_id: str) -> str:
    """Return the user's hosted agent profile as a string, or empty string."""
    row = db.execute(
        text("SELECT user_profile FROM hosted_agents WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if not row or not row[0]:
        return ""
    profile = row[0]
    if isinstance(profile, dict):
        return json.dumps(profile, indent=2)
    return str(profile)


def score_misrepresentation_risk(
    *,
    agent_name: str,
    user_profile: str,
    candidates: list[Notification],
    db: Session,
    pool_size: int = 15,
) -> Optional[list[dict]]:
    """LLM-rank candidate actions by how likely they misrepresent the user.

    Returns a list of dicts shaped like the action dicts the renderer wants,
    ordered most-risky first. Each carries a `riskiest_phrase` and `risk_reason`
    for the hook drafter. Returns None if scoring fails — caller should fall
    back to the heuristic.
    """
    if not user_profile.strip():
        logger.info("No user_profile available — skipping risk scoring.")
        return None
    if not candidates:
        return []

    pool = candidates[:pool_size]
    items = []
    for i, n in enumerate(pool, start=1):
        meta = n.metadata_ or {}
        items.append({
            "i": i,
            "notification": n,
            "action_type": meta.get("action_type", ""),
            "deliberation_id": meta.get("deliberation_id"),
            "question": get_question(db, meta.get("deliberation_id")),
            "opinion_text": meta.get("opinion_text", "") or "",
            "old_opinion_text": meta.get("old_opinion_text", "") or "",
            "acted_at": n.created_at,
        })

    safe_profile = sanitize_prompt_text(user_profile)[:6000]
    rendered = []
    for it in items:
        q = sanitize_prompt_text(it["question"])
        op = sanitize_prompt_text(it["opinion_text"])
        rendered.append(
            f'<action index="{it["i"]}">\n'
            f'  <question>{q}</question>\n'
            f'  <opinion>{op}</opinion>\n'
            f"</action>"
        )
    actions_block = "\n".join(rendered)

    prompt = f"""You are auditing what an AI agent (named "{agent_name}") has been saying
on behalf of a human user. Your job is to find the statements most worth
flagging in a short email — i.e. statements that (a) probably misrepresent
the user, AND (b) are easy to grasp in a skim.

The user's profile (their stated values, positions, background — treat as
ground truth for what they actually believe):
<profile>
{safe_profile}
</profile>

Here are recent statements the agent made on the user's behalf:
{actions_block}

For EACH action, output one JSON object with these fields:
- "index": integer, 1-based, matching the action's index attribute.
- "topic_summary": 3–6 plain-English words naming the topic, no jargon, no
  clauses. Examples: "AI in courts", "App privacy and dating", "Steel grade
  for marine use", "Identity verification online". A reader who knows
  nothing about the deliberation should immediately get the gist.
- "plain_claim": 12–22 words, plain English, no jargon, no clipped phrases,
  no quotation. Paraphrase what the agent CLAIMED on the user's behalf in
  one self-contained sentence. The reader should be able to disagree or
  agree with this sentence on its own, with zero context.
- "risk_score": float in [0.0, 1.0]. Higher = more likely the user would
  reject this opinion as misrepresenting them. Calibrate generously: an
  opinion that drifts from the profile, hedges where the user is decisive,
  or takes a stance the profile doesn't justify should score >= 0.6.
- "comprehensibility": float in [0.0, 1.0]. How easy is this topic to grasp
  in a 5-second skim of an email? Concrete everyday topics (privacy, jobs,
  housing, AI in courts) score high. Specialised technical/industrial
  questions (steel grade, niche compliance, deep economics) score low.
- "riskiest_phrase": a verbatim quote (5–14 words) of the sub-phrase from
  the agent's <opinion> that best captures the deviation. May be empty
  string if no single phrase reads well stand-alone.
- "risk_reason": one short sentence (≤ 25 words) explaining the deviation
  from the user's profile.

Return a JSON array, one object per action, sorted by (risk_score *
comprehensibility) descending. Output ONLY the JSON array — no prose, no
markdown fence.
"""

    client = LLMClient()
    client.set_trace_context(trace_type="review_email_risk_scoring")
    try:
        # Each scored item produces ~250 tokens of JSON, so size the budget
        # against the candidate pool to avoid mid-array truncation.
        max_out = 600 + 350 * len(items)
        raw = client.sample_text(prompt=prompt, temperature=0.3, max_tokens=max_out)
    except Exception as e:
        logger.warning("Risk scoring LLM call failed (%s); will fall back.", e)
        return None

    parsed = _extract_json_array(raw)
    if parsed is None:
        logger.warning("Risk scoring returned non-JSON; will fall back. Raw: %r", raw[:300])
        return None

    by_index = {it["i"]: it for it in items}
    enriched: list[dict] = []
    for entry in parsed:
        idx = entry.get("index")
        if not isinstance(idx, int) or idx not in by_index:
            continue
        it = by_index[idx]
        risk = float(entry.get("risk_score") or 0.0)
        comp = float(entry.get("comprehensibility") or 0.0)
        enriched.append({
            "notification_id": str(it["notification"].id),
            "action_type": it["action_type"],
            "deliberation_id": it["deliberation_id"],
            "question": it["question"],
            "opinion_text": it["opinion_text"],
            "old_opinion_text": it["old_opinion_text"],
            "acted_at": it["acted_at"],
            "risk_score": risk,
            "comprehensibility": comp,
            "combined_score": risk * comp,
            "topic_summary": (entry.get("topic_summary") or "").strip(),
            "plain_claim": (entry.get("plain_claim") or "").strip(),
            "riskiest_phrase": (entry.get("riskiest_phrase") or "").strip(),
            "risk_reason": (entry.get("risk_reason") or "").strip(),
        })

    if not enriched:
        return None
    # Sort by combined score (risk × comprehensibility) so we feature actions
    # that are both likely to misrepresent and easy to grasp at a glance.
    enriched.sort(key=lambda a: a["combined_score"], reverse=True)
    return enriched


def _notification_to_action(n: Notification, db: Session) -> dict:
    """Shape a Notification row into the dict the renderer + hook drafter want."""
    meta = n.metadata_ or {}
    return {
        "notification_id": str(n.id),
        "action_type": meta.get("action_type", ""),
        "deliberation_id": meta.get("deliberation_id"),
        "question": get_question(db, meta.get("deliberation_id")),
        "opinion_text": meta.get("opinion_text", "") or "",
        "old_opinion_text": meta.get("old_opinion_text", "") or "",
        "acted_at": n.created_at,
    }


def _extract_json_array(raw: str) -> Optional[list]:
    """Pull the first JSON array out of an LLM response, tolerating fences."""
    if not raw:
        return None
    s = raw.strip()
    # Strip markdown fences if present
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    # Locate the first '[' and last ']' to be tolerant of trailing prose
    start = s.find("[")
    end = s.rfind("]")
    if start == -1 or end == -1 or end < start:
        return None
    blob = s[start : end + 1]
    try:
        result = json.loads(blob)
        return result if isinstance(result, list) else None
    except json.JSONDecodeError:
        return None


def get_question(db: Session, deliberation_id: Optional[str]) -> str:
    if not deliberation_id:
        return ""
    d = db.query(Deliberation).filter(Deliberation.id == deliberation_id).first()
    return d.question if d else ""


def get_agent_name(db: Session, user_id: str) -> str:
    row = db.execute(
        text(
            "SELECT a.name FROM hosted_agents h "
            "JOIN agents a ON a.id = h.agent_id "
            "WHERE h.user_id = :uid"
        ),
        {"uid": user_id},
    ).fetchone()
    return row[0] if row and row[0] else "Your lobster"


def draft_provocation(
    *,
    agent_name: str,
    first_name: str,
    actions: list[dict],
    risk_signals: Optional[dict] = None,
) -> dict:
    """Use the LLM to draft a subject + opening hook for a *batch* of recent
    autonomous actions. Returns a dict with keys: subject, hook.

    Each action dict has: action_type, question, opinion_text, old_opinion_text.
    """
    client = LLMClient()

    # Build a compact, sanitized rendering of the batch for the prompt.
    rendered = []
    for i, a in enumerate(actions, start=1):
        q = sanitize_prompt_text(a.get("question") or "")
        op = sanitize_prompt_text(a.get("opinion_text") or "")
        old = sanitize_prompt_text(a.get("old_opinion_text") or "")
        block = f"<action index=\"{i}\" type=\"{a.get('action_type','')}\">\n"
        block += f"  <question>{q}</question>\n"
        block += f"  <opinion>{op}</opinion>\n"
        if old:
            block += f"  <previous_opinion>{old}</previous_opinion>\n"
        block += "</action>"
        rendered.append(block)
    actions_block = "\n".join(rendered)

    n = len(actions)

    # The scorer feeds us a plain-English topic + claim for the top action.
    # The hook should be readable WITHOUT knowing the deliberation.
    topic = ""
    claim = ""
    if risk_signals:
        topic = (risk_signals.get("topic_summary") or "").strip()
        claim = (risk_signals.get("plain_claim") or "").strip()

    anchor_block = ""
    if topic or claim:
        anchor_block = "Use these plain-English summaries as the basis of the hook:\n"
        if topic:
            anchor_block += f"  Topic (3–6 words): {sanitize_prompt_text(topic)}\n"
        if claim:
            anchor_block += (
                f"  What the agent claimed (paraphrased, self-contained):\n"
                f"    {sanitize_prompt_text(claim)}\n"
            )

    prompt = f"""You are writing the opening of an email that nudges a human user to
review what their AI agent ("{agent_name}") has been claiming on their
behalf. This is the first thing they read. They will skim. If it isn't
instantly understandable, they bin the email.

The hook must be SKIMMABLE FIRST and provocative second. A reader with zero
context for the deliberation must, in one read, grasp what the agent said
and feel a flicker of "wait, that doesn't sound like me."

Rules:
- Sharp, plain English. Subject + verb + object. No clauses-within-clauses.
- No greeting. Do NOT address the user by name. Do NOT say "your agent".
- Lead with the agent's name as the grammatical subject.
- Name the topic in plain words EARLY (within the first ~8 words).
- PREFER paraphrasing the agent's claim over quoting it verbatim. A short
  verbatim quote is OK only if it stands alone without context.
- No jargon, no compound noun phrases like "emotional volatility and
  prejudice inherent in the current legal system". If the source text is
  jargony, simplify it.
- No marketing. No emoji. No exclamation marks. No "has been busy." No
  "took positions." No "worth checking." No "you may want to."
- Tone: faintly accusatory toward the agent, never toward the user.

{anchor_block}
There are {n} actions in the batch (for tone only — write about action 1):

{actions_block}

Output exactly two sections separated by a line containing only "---":

SUBJECT
Under 65 characters. Plain English. Names the topic. Examples of shape:
  '{agent_name} just took your side on AI in courts'
  '{agent_name} signed you up for replacing judges with AI'
  'Did you really tell {agent_name} that landlords should win?'

---

HOOK
ONE sentence, MAX 25 words. Begin with "{agent_name}". Name the topic in
plain words. Paraphrase what the agent claimed. End with a tight question.
Examples (note how each is grasp-on-skim):
  '{agent_name} just told a public deliberation that AI judges would be
   fairer than human ones. Sound like you?'
  '{agent_name} signed you up for the position that landlords should
   keep deposits by default. Really?'
  '{agent_name} is on record arguing for mandatory ID verification on
   every social app — in your name. Did you mean that?'
"""

    try:
        client.set_trace_context(trace_type="review_email_provocation")
        out = client.sample_text(prompt=prompt, temperature=0.7, max_tokens=400)
    except Exception as e:
        logger.warning("LLM draft failed (%s); using fallback", e)
        return _fallback_batch_draft(agent_name, first_name, actions)

    parts = [p.strip() for p in out.split("---", 1)]
    if len(parts) != 2:
        logger.warning("LLM output didn't split on '---'; using fallback. Raw: %r", out[:300])
        return _fallback_batch_draft(agent_name, first_name, actions)

    subject_block, hook_block = parts
    subject = _strip_label(subject_block, "SUBJECT").strip().strip('"').strip()
    hook = _strip_label(hook_block, "HOOK").strip()

    if not subject or not hook:
        return _fallback_batch_draft(agent_name, first_name, actions)

    return {"subject": subject[:120], "hook": hook}


def _strip_label(block: str, label: str) -> str:
    lines = block.splitlines()
    if lines and lines[0].strip().upper() == label:
        return "\n".join(lines[1:])
    return block


def _fallback_batch_draft(
    agent_name: str, first_name: str, actions: list[dict],
) -> dict:
    """Static fallback — used when the LLM call fails. Tries to quote the top
    action's riskiest_phrase if the scorer surfaced one; otherwise pulls the
    first ~14 words of the opinion as the quote."""
    if not actions:
        return {
            "subject": f"{agent_name} has been speaking for you",
            "hook": f"{agent_name} has been making statements in your name.",
        }
    top = actions[0]

    topic = (top.get("topic_summary") or "").strip()
    if not topic:
        # Best-effort: derive a short topic from the deliberation question.
        q = (top.get("question") or "a deliberation").strip().rstrip("?").strip()
        topic = q if len(q) <= 40 else q[:37] + "…"

    claim = (top.get("plain_claim") or "").strip()
    if not claim:
        op = (top.get("opinion_text") or "").strip()
        words = op.split()
        claim = " ".join(words[:18]) + ("…" if len(words) > 18 else "")

    subject = f'{agent_name} just took your side on {topic}'
    hook = f'{agent_name} just told a public deliberation, in your name, that {claim} Sound like you?'
    return {"subject": subject[:120], "hook": hook}


def _utm_inbox_url(notification_id: Optional[str] = None, source_label: str = "card") -> str:
    """Build an /inbox URL with UTM params so Vercel Analytics + Resend
    click tracking can attribute traffic to the review email.

    When notification_id is set, also add `action=review` so the inbox page
    auto-opens the critique flow on the matching card.
    """
    base = f"{settings.FRONTEND_URL}/inbox"
    params = [
        "utm_source=email",
        "utm_medium=review_nudge",
        f"utm_campaign={datetime.utcnow().strftime('%Y%m%d')}",
        f"utm_content={source_label}",
    ]
    if notification_id:
        params.insert(0, f"notification_id={notification_id}")
        params.insert(1, "action=review")
    return base + "?" + "&".join(params)


def _humanize_ago(when: datetime) -> str:
    """Render a 'X ago' string in the same shape as the frontend's timeAgo()."""
    delta = datetime.utcnow() - when
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = hours // 24
    if days < 7:
        return f"{days} day{'s' if days != 1 else ''} ago"
    weeks = days // 7
    if weeks < 5:
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    months = days // 30
    if months < 12:
        return f"{months} month{'s' if months != 1 else ''} ago"
    return when.strftime("%b %-d, %Y")


_ACTION_LABEL = {
    "join_deliberation": "argued a position",
    "update_opinion": "changed its mind",
    "revisit_opinion": "changed its mind",
    "create_deliberation": "started a new deliberation",
}


def _render_action_card(agent_name: str, action: dict) -> str:
    """Render one action card inside the email body."""
    a_type = action.get("action_type", "")
    question = action.get("question", "") or ""
    opinion_text = action.get("opinion_text", "") or ""
    old_opinion_text = action.get("old_opinion_text", "") or ""
    notification_id = action.get("notification_id", "")
    acted_at: datetime = action.get("acted_at")

    when_str = _humanize_ago(acted_at) if acted_at else ""
    when_iso = acted_at.strftime("%b %-d, %Y at %H:%M UTC") if acted_at else ""
    inbox_url = _utm_inbox_url(notification_id, source_label="card")
    verb = _ACTION_LABEL.get(a_type, "took an action")

    old_html = ""
    if old_opinion_text:
        old_html = f"""
        <div style="background: #f5f5f5; border-radius: 6px; padding: 10px 12px; margin: 0 0 6px;
                    color: #888; font-size: 12px; line-height: 1.5; text-decoration: line-through;">
          <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
                      color: #aaa; margin-bottom: 4px; text-decoration: none;">
            Previous opinion
          </div>
          {_html_escape(old_opinion_text)}
        </div>"""

    label = "New opinion" if old_opinion_text else "What it said"

    return f"""
    <div style="background: #fafafa; border-radius: 8px; padding: 14px 16px; margin: 0 0 12px;">
      <div style="display: flex; justify-content: space-between; gap: 12px;
                  font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
                  color: #999; margin-bottom: 6px;">
        <span>{agent_name} {verb}</span>
        <span title="{when_iso}" style="color: #aaa; flex-shrink: 0;">{when_str}</span>
      </div>
      <div style="color: #555; font-size: 13px; margin-bottom: 8px;">
        on &ldquo;{_html_escape(question)}&rdquo;
      </div>
      {old_html}
      <div style="border-left: 3px solid {BRAND_COLOR}; padding-left: 12px;">
        <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
                    color: #999; margin-bottom: 4px;">
          {label}
        </div>
        <div style="color: #333; font-size: 14px; line-height: 1.55;">
          {_html_escape(opinion_text)}
        </div>
      </div>
      <div style="margin-top: 10px;">
        <a href="{inbox_url}"
           style="color: {BRAND_COLOR}; font-size: 12px; font-weight: 600;
                  text-decoration: none;">
          Review this one &rarr;
        </a>
      </div>
    </div>"""


_APOLOGY_BANNER_HTML = (
    f'<div style="background: #fef2f2; border: 1px solid #fca5a5; '
    f'border-radius: 6px; padding: 10px 14px; margin: 0 0 16px; '
    f'text-align: center;">'
    f'<span style="color: #991b1b; font-size: 13px; line-height: 1.55;">'
    f"Sorry, our last email's link was broken. Here's the working one "
    f"to review your agent."
    f"</span></div>"
)


def render_email_html(
    *,
    agent_name: str,
    hook: str,
    actions: list[dict],
    remaining: int,
    unsubscribe_token: Optional[str],
    apology_banner: bool = False,
) -> str:
    # When there's exactly one featured action, the bottom CTA also deep-
    # links to it (with action=review) so a click anywhere in the email
    # lands the user mid-critique. Multi-action emails keep the bottom CTA
    # generic so users can triage the whole list.
    if len(actions) == 1 and actions[0].get("notification_id"):
        inbox_url = _utm_inbox_url(
            notification_id=actions[0]["notification_id"], source_label="cta"
        )
    else:
        inbox_url = _utm_inbox_url(source_label="cta")

    apology_html = _APOLOGY_BANNER_HTML if apology_banner else ""
    cards_html = "\n".join(_render_action_card(agent_name, a) for a in actions)

    remaining_html = ""
    if remaining > 0:
        remaining_html = f"""
        <div style="background: #fef3c7; border-radius: 6px; padding: 12px 16px;
                    margin: 0 0 12px; text-align: center;">
          <div style="font-size: 13px; color: #92400e; font-weight: 600;">
            + {remaining} more action{'s' if remaining != 1 else ''} waiting in your inbox
          </div>
          <div style="font-size: 12px; color: #a16207; margin-top: 2px;">
            Make sure {agent_name} is representing you well.
          </div>
        </div>"""

    cta_label = "Review &amp; correct in your inbox"

    body = f"""
    <tr>
      <td style="padding: 24px 32px;">
        {apology_html}
        <p style="color: #1a1a1a; line-height: 1.45; font-size: 19px; font-weight: 500;
                  margin: 0 0 22px; letter-spacing: -0.01em; text-align: center;">
          {_emphasise_hook(hook, agent_name)}
        </p>

        {cards_html}

        {remaining_html}

        <div style="border-left: 3px solid {BRAND_COLOR}; background: #fef7f0;
                    padding: 14px 16px; margin: 18px 0 0; border-radius: 0 6px 6px 0;">
          <p style="margin: 0; color: #5c2c14; font-size: 13px; line-height: 1.6;">
            Without your review, {agent_name} can run wild and misrepresent
            you. Every approval grounds it in your real opinions; every silent
            week lets it speak for you in ways you may not recognize. Staying
            looped in is how you keep your proxy yours.
          </p>
        </div>

        <div style="text-align: center; margin: 24px 0 12px;">
          <a href="{inbox_url}"
             style="display: inline-block; background: {BRAND_COLOR}; color: #fff;
                    padding: 12px 28px; border-radius: 6px; text-decoration: none;
                    font-weight: 600; font-size: 14px;">
            {cta_label}
          </a>
        </div>

        <p style="color: #888; font-size: 12px; line-height: 1.5; margin: 16px 0 0; text-align: center;">
          If these represent you, do nothing. Otherwise, one click critiques
          and rewrites them.
        </p>
      </td>
    </tr>
    """

    return _email_wrapper(body, unsubscribe_token)


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
         .replace("<", "&lt;")
         .replace(">", "&gt;")
         .replace('"', "&quot;")
    )


def _html_escape_paragraph(s: str) -> str:
    # Same as escape, but preserve paragraph-style line breaks.
    return _html_escape(s).replace("\n", "<br>")


def _emphasise_hook(hook: str, agent_name: str) -> str:
    """Bold the agent's name and the trailing question (last sentence ending
    in '?') in the hook paragraph. The trailing question is pushed to its
    own line via <br>. Renders to email-safe HTML.
    """
    escaped = _html_escape_paragraph(hook)
    escaped_name = _html_escape(agent_name)
    if escaped_name and escaped_name in escaped:
        escaped = escaped.replace(
            escaped_name,
            f'<strong style="color: {BRAND_COLOR};">{escaped_name}</strong>',
            1,
        )
    # Push the final question onto its own line and bold it.
    m = re.search(r"([^.?!]*\?)\s*$", escaped)
    if m:
        question = m.group(1).strip()
        if question and len(question) <= 80:
            escaped = (
                escaped[: m.start()].rstrip()
                + f'<br><br><strong>{question}</strong>'
                + escaped[m.end():]
            )
    return escaped


def fetch_all_eligible_users(
    db: Session,
    exclude_user_id: Optional[str],
    nudge_cooldown_days: int = 0,
) -> list[dict]:
    """Every hosted-agent user with a profile + at least one reviewable
    notification not already nudged within the cooldown window. Ordered
    deterministically by user id."""
    cooldown_filter = ""
    if nudge_cooldown_days > 0:
        # Exclude users whose most recent review_nudge_sent_at is within
        # cooldown — i.e. weekly users get one email per week regardless
        # of how many candidate actions they have.
        cooldown_filter = """
              AND NOT EXISTS (
                  SELECT 1 FROM notifications nf2
                  WHERE nf2.user_id = u.id
                    AND nf2.review_nudge_sent_at IS NOT NULL
                    AND nf2.review_nudge_sent_at >
                        (NOW() AT TIME ZONE 'UTC') - INTERVAL ':cooldown days'
              )"""
        # Postgres won't bind interval parameters directly via :cooldown — use
        # a safe int interpolation since the value is a validated int arg.
        cooldown_filter = cooldown_filter.replace(
            "INTERVAL ':cooldown days'",
            f"INTERVAL '{int(nudge_cooldown_days)} days'",
        )

    rows = db.execute(
        text(
            f"""
            SELECT DISTINCT u.id, u.email, u.name
            FROM "user" u
            JOIN hosted_agents h ON h.user_id = u.id
            JOIN notifications nf ON nf.user_id = u.id
            WHERE nf.type = 'agent_action'
              AND nf.approval_status IS NULL
              AND (nf.metadata->>'reviewable') = 'true'
              AND h.user_profile IS NOT NULL
              AND (:exclude IS NULL OR u.id <> :exclude)
              {cooldown_filter}
            ORDER BY u.id
            """
        ),
        {"exclude": exclude_user_id},
    ).fetchall()
    return [{"id": r[0], "email": r[1], "name": r[2] or "there"} for r in rows]


def sample_eligible_users(db: Session, n: int, exclude_user_id: Optional[str]) -> list[dict]:
    """Pick N random users with a hosted agent + profile + at least one
    reviewable notification. Each result has id, email, name."""
    rows = db.execute(
        text(
            """
            SELECT id, email, name FROM (
                SELECT DISTINCT u.id, u.email, u.name
                FROM "user" u
                JOIN hosted_agents h ON h.user_id = u.id
                JOIN notifications nf ON nf.user_id = u.id
                WHERE nf.type = 'agent_action'
                  AND nf.approval_status IS NULL
                  AND (nf.metadata->>'reviewable') = 'true'
                  AND h.user_profile IS NOT NULL
                  AND (:exclude IS NULL OR u.id <> :exclude)
            ) eligible
            ORDER BY random()
            LIMIT :n
            """
        ),
        {"n": n, "exclude": exclude_user_id},
    ).fetchall()
    return [{"id": r[0], "email": r[1], "name": r[2] or "there"} for r in rows]


def build_email_for_user(
    *,
    db: Session,
    user: dict,
    args,
    force_notification_id: Optional[str] = None,
    apology_banner: bool = False,
    subject_prefix: str = "",
) -> Optional[dict]:
    """Run the picker → scorer → drafter → renderer pipeline for one user.

    Returns a dict with keys: subject, html, top_notification_id, num_actions,
    remaining, agent_name, unsubscribe_token, featured_notification_ids.
    Returns None if the user has no eligible candidates.

    force_notification_id: skip the heuristic / scorer and feature this exact
    notification (used by --resend-today to re-send the same content).
    apology_banner: render the "Resending — link fixed" callout at the top.
    subject_prefix: prepend to the LLM-drafted subject (e.g. "Resending: ").
    """
    agent_name = get_agent_name(db, user["id"])
    first_name = (user["name"] or "there").split()[0]
    user_profile = get_user_profile(db, user["id"])

    if force_notification_id:
        forced = (
            db.query(Notification)
            .filter(
                Notification.id == force_notification_id,
                Notification.user_id == user["id"],
            )
            .first()
        )
        if not forced:
            return None
        all_candidates = [forced]
    else:
        cooldown = getattr(args, "nudge_cooldown_days", 0) or 0
        all_candidates = fetch_candidates(
            db, user["id"], nudge_cooldown_days=cooldown
        )
    if not all_candidates:
        return None

    scored: Optional[list[dict]] = None
    if not args.no_llm:
        scored = score_misrepresentation_risk(
            agent_name=agent_name,
            user_profile=user_profile,
            candidates=all_candidates,
            db=db,
        )

    if scored:
        actions = scored[: args.max_actions]
        # In resend mode the candidate pool is the single forced notification,
        # so "remaining" should reflect the user's *real* outstanding inbox
        # count, not the trivially-zero leftover from a 1-item pool.
        if force_notification_id:
            remaining_q = fetch_candidates(db, user["id"], nudge_cooldown_days=0)
            remaining = max(0, len(remaining_q) - len(actions))
        else:
            remaining = max(0, len(all_candidates) - len(actions))
    else:
        featured_notifs, remaining = heuristic_pick(all_candidates, args.max_actions)
        actions = [_notification_to_action(n_, db) for n_ in featured_notifs]
        if force_notification_id:
            remaining_q = fetch_candidates(db, user["id"], nudge_cooldown_days=0)
            remaining = max(0, len(remaining_q) - len(actions))

    risk_signals = None
    if actions:
        top = actions[0]
        if any(top.get(k) for k in (
            "topic_summary", "plain_claim", "riskiest_phrase", "risk_reason",
        )):
            risk_signals = {
                "topic_summary": top.get("topic_summary", ""),
                "plain_claim": top.get("plain_claim", ""),
                "riskiest_phrase": top.get("riskiest_phrase", ""),
                "risk_reason": top.get("risk_reason", ""),
            }

    if args.no_llm:
        draft = _fallback_batch_draft(agent_name, first_name, actions)
    else:
        draft = draft_provocation(
            agent_name=agent_name,
            first_name=first_name,
            actions=actions,
            risk_signals=risk_signals,
        )

    pref = get_or_create_email_preference(db, user["id"])
    db.commit()

    html = render_email_html(
        agent_name=agent_name,
        hook=draft["hook"],
        actions=actions,
        remaining=remaining,
        unsubscribe_token=pref.unsubscribe_token,
        apology_banner=apology_banner,
    )

    final_subject = (subject_prefix + draft["subject"]) if subject_prefix else draft["subject"]

    return {
        "subject": final_subject,
        "html": html,
        "top_notification_id": actions[0]["notification_id"] if actions else None,
        "featured_notification_ids": [a["notification_id"] for a in actions],
        "num_actions": len(actions),
        "remaining": remaining,
        "agent_name": agent_name,
        "unsubscribe_token": pref.unsubscribe_token,
        "weekly_summary_opt_in": pref.weekly_summary,
    }


def render_preview_for_user(*, db: Session, user: dict, args) -> Optional[str]:
    """Build the email and write it to /tmp as an HTML file. No send."""
    built = build_email_for_user(db=db, user=user, args=args)
    if not built:
        return None
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    path = os.path.join(
        tempfile.gettempdir(), f"habermolt_review_{user['id'][:8]}_{ts}.html"
    )
    with open(path, "w") as f:
        f.write(built["html"])
    logger.info(
        "  -> %s | agent=%s | featured=%d | remaining=%d | subject=%r",
        user["email"], built["agent_name"], built["num_actions"],
        built["remaining"], built["subject"][:80],
    )
    return path


def fetch_users_nudged_today(db: Session) -> list[dict]:
    """Find every user whose notifications were nudged in the last 24 hours,
    paired with the most recently nudged notification (which is the one their
    broken email referred to). Returns dicts with id, email, name, top_nid."""
    rows = db.execute(
        text(
            """
            WITH ranked AS (
                SELECT
                    nf.user_id,
                    nf.id AS notif_id,
                    nf.review_nudge_sent_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY nf.user_id
                        ORDER BY nf.review_nudge_sent_at DESC
                    ) AS rn
                FROM notifications nf
                WHERE nf.review_nudge_sent_at IS NOT NULL
                  AND nf.review_nudge_sent_at >
                      (NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours'
            )
            SELECT u.id, u.email, u.name, r.notif_id::text
            FROM ranked r
            JOIN "user" u ON u.id = r.user_id
            WHERE r.rn = 1
            ORDER BY u.id
            """
        )
    ).fetchall()
    return [
        {"id": r[0], "email": r[1], "name": r[2] or "there", "top_nid": r[3]}
        for r in rows
    ]


def resend_today(*, db: Session, args) -> None:
    """Resend the same review email (with apology banner + 'Resending: '
    subject prefix) to every user nudged in the last 24 hours.

    Same safety rails as broadcast(): requires --confirm SEND-TO-ALL, skips
    weekly_summary opt-outs, throttles, aborts on localhost links, writes a
    CSV log. Pass --dry-run to render previews to /tmp without sending.
    """
    if not args.dry_run and args.confirm != "SEND-TO-ALL":
        logger.error(
            "--resend-today requires '--confirm SEND-TO-ALL' (or --dry-run)."
        )
        sys.exit(2)
    if "localhost" in settings.FRONTEND_URL or "127.0.0.1" in settings.FRONTEND_URL:
        logger.error(
            "settings.FRONTEND_URL = %s — refusing to resend localhost URLs.",
            settings.FRONTEND_URL,
        )
        sys.exit(1)
    if not args.dry_run and not settings.RESEND_API_KEY:
        logger.error("RESEND_API_KEY is not set; cannot send.")
        sys.exit(1)
    if not args.dry_run:
        resend.api_key = settings.RESEND_API_KEY

    targets = fetch_users_nudged_today(db)
    total = len(targets)
    if args.limit and args.limit > 0:
        targets = targets[: args.limit]
    logger.info(
        "Resend-today: %d target(s) (out of %d nudged in last 24h). dry_run=%s.",
        len(targets), total, args.dry_run,
    )

    log_path = os.path.join(
        tempfile.gettempdir(),
        f"habermolt_resend_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
    )
    sent = 0
    skipped_optout = 0
    skipped_no_actions = 0
    failed = 0
    preview_paths: list[str] = []

    with open(log_path, "w", newline="") as logf:
        writer = csv.writer(logf)
        writer.writerow([
            "timestamp", "user_id", "email", "agent_name",
            "top_notification_id", "subject", "status", "error",
        ])

        for i, u in enumerate(targets, start=1):
            ts = datetime.utcnow().isoformat()
            try:
                built = build_email_for_user(
                    db=db, user=u, args=args,
                    force_notification_id=u["top_nid"],
                    apology_banner=True,
                    subject_prefix="Resending: ",
                )
                if not built:
                    skipped_no_actions += 1
                    writer.writerow([ts, u["id"], u["email"], "", "", "",
                                     "skipped_no_actions", ""])
                    logger.info("[%d/%d] SKIP no-actions %s", i, len(targets), u["email"])
                    continue
                if not built.get("weekly_summary_opt_in", True):
                    skipped_optout += 1
                    writer.writerow([ts, u["id"], u["email"], built["agent_name"],
                                     built["top_notification_id"] or "",
                                     built["subject"], "skipped_optout", ""])
                    logger.info("[%d/%d] SKIP opt-out %s", i, len(targets), u["email"])
                    continue
                _assert_no_localhost_links(built["html"])

                if args.dry_run:
                    p_ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    p_path = os.path.join(
                        tempfile.gettempdir(),
                        f"habermolt_resend_{u['id'][:8]}_{p_ts}.html",
                    )
                    with open(p_path, "w") as pf:
                        pf.write(built["html"])
                    preview_paths.append(p_path)
                    logger.info("[%d/%d] PREVIEW %s -> %s | %r",
                                i, len(targets), u["email"], p_path, built["subject"][:80])
                else:
                    resend.Emails.send({
                        "from": FROM_ADDRESS,
                        "to": u["email"],
                        "subject": built["subject"],
                        "html": built["html"],
                        "headers": {
                            "List-Unsubscribe": f"<{settings.FRONTEND_URL}/unsubscribe?token={built['unsubscribe_token']}>",
                            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                        },
                    })
                    sent += 1
                    writer.writerow([ts, u["id"], u["email"], built["agent_name"],
                                     built["top_notification_id"] or "",
                                     built["subject"], "sent", ""])
                    logger.info("[%d/%d] SENT %s | %r",
                                i, len(targets), u["email"], built["subject"][:80])

            except Exception as e:
                failed += 1
                err = str(e)[:300]
                writer.writerow([ts, u["id"], u["email"], "", "", "", "failed", err])
                logger.error("[%d/%d] FAIL %s: %s", i, len(targets), u["email"], err)

            if args.throttle_seconds and i < len(targets):
                time.sleep(args.throttle_seconds)

    if args.dry_run:
        logger.info("Resend-today DRY RUN complete. previews=%d", len(preview_paths))
        print()
        print("Preview paths:")
        for p in preview_paths[:5]:
            print(f"  {p}")
        if len(preview_paths) > 5:
            print(f"  ... and {len(preview_paths) - 5} more in {tempfile.gettempdir()}")
    else:
        logger.info(
            "Resend-today complete. sent=%d skipped_optout=%d skipped_no_actions=%d failed=%d",
            sent, skipped_optout, skipped_no_actions, failed,
        )
        logger.info("Log: %s", log_path)


def _assert_no_localhost_links(html: str) -> None:
    """Refuse to send anything pointing at localhost. Last-line defence
    against env-loading bugs that would otherwise silently ship dev URLs
    to real users (see broken broadcast 2026-04-28)."""
    if "localhost" in html or "127.0.0.1" in html:
        raise RuntimeError(
            "Refusing to send: rendered HTML contains a localhost URL. "
            "Check FRONTEND_URL and re-run with --prod."
        )


def broadcast(*, db: Session, args) -> None:
    """Send the review email to every eligible hosted-agent user.

    Safety:
      - Requires --confirm SEND-TO-ALL.
      - Skips users whose email_preferences.weekly_summary == False.
      - Throttles between sends (--throttle-seconds, default 1.0).
      - --limit caps the audience for staged rollout.
      - Writes a CSV log to /tmp listing every attempt.
      - Aborts the whole broadcast if any rendered email contains a
        localhost URL — protects against env-loading regressions.
    """
    if args.confirm != "SEND-TO-ALL":
        logger.error(
            "--send-all requires '--confirm SEND-TO-ALL' (literally those caps). "
            "Refusing to broadcast."
        )
        sys.exit(2)
    if not settings.RESEND_API_KEY:
        logger.error("RESEND_API_KEY is not set; cannot send.")
        sys.exit(1)
    if "localhost" in settings.FRONTEND_URL or "127.0.0.1" in settings.FRONTEND_URL:
        logger.error(
            "settings.FRONTEND_URL = %s — refusing to broadcast localhost URLs. "
            "Pass --prod or export FRONTEND_URL=https://habermolt.com.",
            settings.FRONTEND_URL,
        )
        sys.exit(1)

    # Initialise Resend once.
    resend.api_key = settings.RESEND_API_KEY

    eligible = fetch_all_eligible_users(
        db,
        exclude_user_id=None,
        nudge_cooldown_days=getattr(args, "nudge_cooldown_days", 7),
    )
    total_eligible = len(eligible)
    if args.limit and args.limit > 0:
        eligible = eligible[: args.limit]
    logger.info(
        "Broadcasting to %d user(s) (out of %d eligible). Throttle=%.2fs.",
        len(eligible), total_eligible, args.throttle_seconds,
    )

    log_path = os.path.join(
        tempfile.gettempdir(),
        f"habermolt_send_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
    )
    sent = 0
    skipped_optout = 0
    skipped_no_actions = 0
    failed = 0

    with open(log_path, "w", newline="") as logf:
        writer = csv.writer(logf)
        writer.writerow([
            "timestamp", "user_id", "email", "agent_name",
            "top_notification_id", "subject", "status", "error",
        ])

        for i, u in enumerate(eligible, start=1):
            ts = datetime.utcnow().isoformat()
            try:
                built = build_email_for_user(db=db, user=u, args=args)
                if not built:
                    skipped_no_actions += 1
                    writer.writerow([ts, u["id"], u["email"], "", "", "",
                                     "skipped_no_actions", ""])
                    logger.info("[%d/%d] SKIP no-actions %s", i, len(eligible), u["email"])
                    continue
                if not built.get("weekly_summary_opt_in", True):
                    skipped_optout += 1
                    writer.writerow([ts, u["id"], u["email"], built["agent_name"],
                                     built["top_notification_id"] or "",
                                     built["subject"], "skipped_optout", ""])
                    logger.info("[%d/%d] SKIP opt-out %s", i, len(eligible), u["email"])
                    continue

                resend.Emails.send({
                    "from": FROM_ADDRESS,
                    "to": u["email"],
                    "subject": built["subject"],
                    "html": built["html"],
                    "headers": {
                        "List-Unsubscribe": f"<{settings.FRONTEND_URL}/unsubscribe?token={built['unsubscribe_token']}>",
                        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                    },
                })
                # Mark the featured notification(s) as nudged so the next
                # weekly run doesn't re-feature them within the cooldown.
                ids = built.get("featured_notification_ids") or []
                if ids:
                    db.query(Notification).filter(
                        Notification.id.in_(ids)
                    ).update(
                        {"review_nudge_sent_at": datetime.utcnow()},
                        synchronize_session=False,
                    )
                    db.commit()

                sent += 1
                writer.writerow([ts, u["id"], u["email"], built["agent_name"],
                                 built["top_notification_id"] or "",
                                 built["subject"], "sent", ""])
                logger.info("[%d/%d] SENT %s | %r",
                            i, len(eligible), u["email"], built["subject"][:80])

            except Exception as e:
                failed += 1
                err = str(e)[:300]
                writer.writerow([ts, u["id"], u["email"], "", "", "", "failed", err])
                logger.error("[%d/%d] FAIL %s: %s", i, len(eligible), u["email"], err)

            if args.throttle_seconds and i < len(eligible):
                time.sleep(args.throttle_seconds)

    logger.info(
        "Broadcast complete. sent=%d skipped_optout=%d skipped_no_actions=%d failed=%d",
        sent, skipped_optout, skipped_no_actions, failed,
    )
    logger.info("Log: %s", log_path)


def main():
    parser = argparse.ArgumentParser(description="Send a review-nudge email to one user.")
    parser.add_argument("--email", help="Recipient email address (required unless --sample is set)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Don't send; write rendered HTML to /tmp")
    parser.add_argument("--no-llm", action="store_true",
                        help="Skip the LLM provocation draft (use static fallback)")
    parser.add_argument("--max-actions", type=int, default=1,
                        help="Maximum number of actions to feature in the email (default 1; "
                             "the rest are surfaced as a '+ N more waiting' banner)")
    parser.add_argument("--prod", action="store_true",
                        help="Use PRODUCTION_DATABASE_URL from the root .env (else uses local DATABASE_URL)")
    parser.add_argument("--notification-id", default=None,
                        help="Force a specific notification ID (overrides heuristic, sends a single-action email)")
    parser.add_argument("--sample", type=int, default=0,
                        help="Render dry-run previews for N random eligible users instead of sending. "
                             "Implies --dry-run. --email is not required in this mode.")
    parser.add_argument("--send-all", action="store_true",
                        help="BROADCAST: send to every eligible hosted-agent user. Requires "
                             "--confirm SEND-TO-ALL. --email is not required in this mode.")
    parser.add_argument("--confirm", default="",
                        help="Pass '--confirm SEND-TO-ALL' to actually broadcast.")
    parser.add_argument("--limit", type=int, default=0,
                        help="Cap broadcast audience to first N users (deterministic order). "
                             "0 = no cap. Useful for staged rollout, e.g. --send-all --limit 5.")
    parser.add_argument("--throttle-seconds", type=float, default=1.0,
                        help="Sleep between broadcast sends to stay under Resend rate limits "
                             "(default 1.0)")
    parser.add_argument("--nudge-cooldown-days", type=int, default=7,
                        help="Skip notifications already nudged within the last N days "
                             "(default 7). Set 0 to disable cooldown.")
    parser.add_argument("--resend-today", action="store_true",
                        help="Resend the same review email to every user nudged in the "
                             "last 24h, with a 'Resending — link fixed' banner and "
                             "'Resending: ' subject prefix. For recovering from a botched "
                             "broadcast. Combine with --dry-run to render previews first.")
    args = parser.parse_args()

    if args.sample > 0:
        args.dry_run = True  # safety: never actually send when sampling
    elif args.send_all:
        pass  # broadcast handled in main(); --email not required
    elif args.resend_today:
        pass  # resend handled in main(); --email not required
    elif not args.email:
        parser.error(
            "--email is required unless --sample N, --send-all, or --resend-today is set"
        )

    # Log which DB we're hitting (host only — never the password).
    db_url = os.environ.get("DATABASE_URL", "")
    db_host = db_url.split("@", 1)[1].split("/", 1)[0] if "@" in db_url else "(local)"
    logger.info("DB target: %s%s", db_host, "  [PRODUCTION]" if args.prod else "")

    db = SessionLocal()
    try:
        if args.resend_today:
            resend_today(db=db, args=args)
            return

        if args.send_all:
            broadcast(db=db, args=args)
            return

        if args.sample > 0:
            # Find oscar's user_id (if present) so we can exclude them from the sample.
            oscar = find_user_by_email(db, "oscar@martinduys.com")
            exclude_id = oscar["id"] if oscar else None

            sampled = sample_eligible_users(db, args.sample, exclude_id)
            if not sampled:
                logger.error("No eligible users found for sampling.")
                sys.exit(1)
            logger.info("Rendering previews for %d random user(s):", len(sampled))
            paths: list[str] = []
            for u in sampled:
                p = render_preview_for_user(db=db, user=u, args=args)
                if p:
                    paths.append(p)
            print()
            print("Preview paths:")
            for p in paths:
                print(f"  {p}")
            return

        user = find_user_by_email(db, args.email)
        if not user:
            logger.error("No user found with email %s", args.email)
            sys.exit(1)
        logger.info("Found user %s (id=%s)", user["email"], user["id"])

        agent_name = get_agent_name(db, user["id"])
        first_name = (user["name"] or "there").split()[0]
        user_profile = get_user_profile(db, user["id"])
        logger.info("User profile: %s", "present" if user_profile.strip() else "missing")

        if args.notification_id:
            notification = (
                db.query(Notification)
                .filter(
                    Notification.id == args.notification_id,
                    Notification.user_id == user["id"],
                )
                .first()
            )
            if not notification:
                logger.error("Notification %s not found for this user", args.notification_id)
                sys.exit(1)
            featured_notifs = [notification]
            remaining = 0
            actions: list[dict] = [_notification_to_action(notification, db)]
        else:
            all_candidates = fetch_candidates(db, user["id"])
            if not all_candidates:
                logger.error("No reviewable notifications found for %s", args.email)
                sys.exit(1)

            scored: Optional[list[dict]] = None
            if not args.no_llm:
                scored = score_misrepresentation_risk(
                    agent_name=agent_name,
                    user_profile=user_profile,
                    candidates=all_candidates,
                    db=db,
                )

            if scored:
                actions = scored[: args.max_actions]
                # Remaining = everything else in the candidate pool, scored or not.
                remaining = max(0, len(all_candidates) - len(actions))
                logger.info("Risk-scored %d candidate(s); featuring top %d.",
                            len(scored), len(actions))
                for a in actions:
                    logger.info("  - risk=%.2f | %s | phrase=%r",
                                a.get("risk_score", 0.0),
                                a["question"][:60],
                                (a.get("riskiest_phrase") or "")[:80])
            else:
                featured_notifs, remaining = heuristic_pick(all_candidates, args.max_actions)
                actions = [_notification_to_action(n, db) for n in featured_notifs]
                logger.info("Heuristic fallback; featuring %d action(s).", len(actions))
                for a in actions:
                    logger.info("  - %s | %s", a["action_type"], a["question"][:60])

        logger.info("Remaining in inbox after featured: %d", remaining)

        # Risk signals from the top action drive the hook prompt. We pass
        # the plain-English topic + claim so the hook can be readable cold.
        risk_signals = None
        if actions:
            top = actions[0]
            if any(top.get(k) for k in (
                "topic_summary", "plain_claim", "riskiest_phrase", "risk_reason",
            )):
                risk_signals = {
                    "topic_summary": top.get("topic_summary", ""),
                    "plain_claim": top.get("plain_claim", ""),
                    "riskiest_phrase": top.get("riskiest_phrase", ""),
                    "risk_reason": top.get("risk_reason", ""),
                }

        if args.no_llm:
            draft = _fallback_batch_draft(agent_name, first_name, actions)
        else:
            draft = draft_provocation(
                agent_name=agent_name,
                first_name=first_name,
                actions=actions,
                risk_signals=risk_signals,
            )

        pref = get_or_create_email_preference(db, user["id"])
        db.commit()

        html = render_email_html(
            agent_name=agent_name,
            hook=draft["hook"],
            actions=actions,
            remaining=remaining,
            unsubscribe_token=pref.unsubscribe_token,
        )

        logger.info("Subject: %s", draft["subject"])

        if args.dry_run:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = os.path.join(tempfile.gettempdir(), f"habermolt_review_{ts}.html")
            with open(path, "w") as f:
                f.write(html)
            logger.info("DRY RUN — wrote preview to %s", path)
            print(path)
            return

        if not settings.RESEND_API_KEY:
            logger.error("RESEND_API_KEY is not set; cannot send. Use --dry-run for preview.")
            sys.exit(1)

        resend.api_key = settings.RESEND_API_KEY
        result = resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": user["email"],
            "subject": draft["subject"],
            "html": html,
            "headers": {
                "List-Unsubscribe": f"<{settings.FRONTEND_URL}/unsubscribe?token={pref.unsubscribe_token}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        })
        # Mark featured notifications as nudged so the broadcast cooldown
        # filter excludes this user from any subsequent --send-all run.
        nudged_ids = [a["notification_id"] for a in actions]
        if nudged_ids:
            db.query(Notification).filter(
                Notification.id.in_(nudged_ids)
            ).update(
                {"review_nudge_sent_at": datetime.utcnow()},
                synchronize_session=False,
            )
            db.commit()
        logger.info("Sent. Resend response: %s", result)

    finally:
        db.close()


if __name__ == "__main__":
    main()
