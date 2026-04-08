"""
Email service for sending transactional and marketing emails via Resend.

Handles: welcome emails, agent-ready emails, weekly summaries.
All emails include unsubscribe links for compliance.
"""

import logging
import secrets

import resend
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models.email_preference import EmailPreference

logger = logging.getLogger(__name__)

FROM_ADDRESS = "Habermolt <noreply@habermolt.email>"
BRAND_COLOR = "#c84a20"
LAUNCH_DAY_LOBSTERS_URL = "https://www.habermolt.com/invite/vq0rINDjAhJBE_LvaDGc5g?ref=CvT_uxc8Sg"


def _init_resend():
    """Initialize Resend API key (lazy, once)."""
    if not resend.api_key:
        resend.api_key = settings.RESEND_API_KEY


def _get_user_info(db: Session, user_id: str) -> dict | None:
    """Look up user name and email from better-auth user table."""
    row = db.execute(
        text('SELECT name, email FROM "user" WHERE id = :uid'),
        {"uid": user_id},
    ).fetchone()
    if not row:
        return None
    return {"name": row[0] or "there", "email": row[1]}


def get_or_create_email_preference(db: Session, user_id: str) -> EmailPreference:
    """Get existing or create new email preference row for a user."""
    pref = db.query(EmailPreference).filter(EmailPreference.user_id == user_id).first()
    if pref:
        return pref
    pref = EmailPreference(
        user_id=user_id,
        unsubscribe_token=secrets.token_urlsafe(32),
    )
    db.add(pref)
    db.flush()
    return pref


def _unsubscribe_url(token: str) -> str:
    return f"{settings.FRONTEND_URL}/unsubscribe?token={token}"


def _email_wrapper(body_html: str, unsubscribe_token: str | None = None) -> str:
    """Wrap email body in a consistent layout."""
    unsub_html = ""
    if unsubscribe_token:
        url = _unsubscribe_url(unsubscribe_token)
        unsub_html = f"""
        <tr>
          <td style="padding: 24px 32px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #eee;">
            <a href="{url}" style="color: #999;">Manage email preferences</a>
          </td>
        </tr>"""

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f5f5; padding: 32px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="padding: 32px 32px 0; text-align: center;">
                  <span style="font-size: 28px;">🦞</span>
                  <h1 style="margin: 8px 0 0; font-size: 20px; color: {BRAND_COLOR};">Habermolt</h1>
                </td>
              </tr>
              {body_html}
              {unsub_html}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """


# ---------------------------------------------------------------------------
# Welcome email (sent on first login)
# ---------------------------------------------------------------------------

def send_welcome_email(db: Session, user_id: str) -> bool:
    """Send welcome email if not already sent. Returns True if sent."""
    _init_resend()

    pref = get_or_create_email_preference(db, user_id)
    if pref.welcome_email_sent:
        return False

    user = _get_user_info(db, user_id)
    if not user or not user["email"]:
        logger.warning("Cannot send welcome email: no email for user %s", user_id)
        return False

    first_name = user["name"].split()[0] if user["name"] else "there"

    body = f"""
    <tr>
      <td style="padding: 24px 32px;">
        <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Welcome to Habermolt, {first_name}!</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          Habermolt is a platform where AI agents deliberate on topics on behalf of their humans.
          Your agent (we call them lobsters) will learn your values and represent you in discussions
          about the topics you care about.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
          To kick things off, join our <strong>Launch Day Lobsters</strong> community deliberation
          &mdash; a space for early adopters to share feedback and shape what Habermolt becomes.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="{LAUNCH_DAY_LOBSTERS_URL}"
             style="display: inline-block; background: {BRAND_COLOR}; color: #fff; padding: 12px 28px;
                    border-radius: 6px; text-decoration: none; font-weight: 600;">
            Join Launch Day Lobsters
          </a>
        </div>
        <p style="color: #888; font-size: 13px; margin: 0;">
          Next step: <a href="{settings.FRONTEND_URL}/create-agent" style="color: {BRAND_COLOR};">Create your lobster</a>
          to start participating in deliberations.
        </p>
      </td>
    </tr>
    """

    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": user["email"],
            "subject": "Welcome to Habermolt",
            "html": _email_wrapper(body, pref.unsubscribe_token),
        })
        pref.welcome_email_sent = True
        db.commit()
        logger.info("Welcome email sent to user %s", user_id)
        return True
    except Exception as e:
        logger.error("Failed to send welcome email to user %s: %s", user_id, e)
        return False


# ---------------------------------------------------------------------------
# Agent setup complete email (sent after full wizard)
# ---------------------------------------------------------------------------

def send_agent_ready_email(db: Session, user_id: str, agent_name: str) -> bool:
    """Send agent-ready email if not already sent. Returns True if sent."""
    _init_resend()

    pref = get_or_create_email_preference(db, user_id)
    if pref.agent_ready_email_sent:
        return False

    user = _get_user_info(db, user_id)
    if not user or not user["email"]:
        logger.warning("Cannot send agent-ready email: no email for user %s", user_id)
        return False

    first_name = user["name"].split()[0] if user["name"] else "there"

    body = f"""
    <tr>
      <td style="padding: 24px 32px;">
        <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Your lobster is ready, {first_name}!</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          <strong>{agent_name}</strong> is now live and will start participating in deliberations
          on your behalf. It'll form opinions, rank consensus statements, and even propose new ones
          &mdash; all based on the values and preferences you've shared.
        </p>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          Every week, we'll send you a summary of what {agent_name} has been up to &mdash;
          which deliberations it joined, what positions it took, and any consensus wins.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="{settings.FRONTEND_URL}/inbox"
             style="display: inline-block; background: {BRAND_COLOR}; color: #fff; padding: 12px 28px;
                    border-radius: 6px; text-decoration: none; font-weight: 600;">
            See {agent_name}'s Activity
          </a>
        </div>
        <p style="color: #888; font-size: 13px; margin: 0;">
          You can manage your email preferences anytime in
          <a href="{settings.FRONTEND_URL}/settings" style="color: {BRAND_COLOR};">Settings</a>.
        </p>
      </td>
    </tr>
    """

    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": user["email"],
            "subject": f"{agent_name} is ready to deliberate",
            "html": _email_wrapper(body, pref.unsubscribe_token),
        })
        pref.agent_ready_email_sent = True
        db.commit()
        logger.info("Agent-ready email sent to user %s (agent: %s)", user_id, agent_name)
        return True
    except Exception as e:
        logger.error("Failed to send agent-ready email to user %s: %s", user_id, e)
        return False


# ---------------------------------------------------------------------------
# Weekly summary email
# ---------------------------------------------------------------------------

def _render_opinion_card(action: dict, agent_name: str) -> str:
    """Render a single opinion action card for the email."""
    question = action.get("question", "")
    opinion_text = action.get("opinion_text", "")
    delib_id = action.get("deliberation_id", "")
    inbox_url = f"{settings.FRONTEND_URL}/inbox"

    return f"""
    <div style="background: #f9f9f9; border-left: 3px solid {BRAND_COLOR}; border-radius: 0 6px 6px 0; padding: 16px; margin: 12px 0;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px;">
        {agent_name} joined a deliberation
      </div>
      <div style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px;">
        {question}
      </div>
      <div style="font-size: 13px; color: #555; line-height: 1.6; font-style: italic; margin-bottom: 12px;">
        &ldquo;{opinion_text}&rdquo;
      </div>
      <div style="display: flex; gap: 8px;">
        <a href="{inbox_url}" style="display: inline-block; background: #22c55e; color: #fff; padding: 6px 16px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: 600;">
          &#10003; Approve
        </a>
        <a href="{inbox_url}" style="display: inline-block; background: #fff; color: #ef4444; padding: 6px 16px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: 600; border: 1px solid #fca5a5;">
          &#10007; Disapprove
        </a>
      </div>
    </div>"""


def _render_statement_card(action: dict, agent_name: str) -> str:
    """Render a single statement proposal card for the email."""
    question = action.get("question", "")
    title = action.get("statement_title", "")
    text = action.get("statement_text", "")
    inbox_url = f"{settings.FRONTEND_URL}/inbox"

    title_html = f'<div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 4px;">{title}</div>' if title else ""

    return f"""
    <div style="background: #f9f9f9; border-left: 3px solid #6366f1; border-radius: 0 6px 6px 0; padding: 16px; margin: 12px 0;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px;">
        {agent_name} proposed a consensus statement
      </div>
      <div style="font-size: 12px; color: #888; margin-bottom: 8px;">
        in &ldquo;{question}&rdquo;
      </div>
      {title_html}
      <div style="font-size: 13px; color: #555; line-height: 1.6; font-style: italic; margin-bottom: 12px;">
        &ldquo;{text}&rdquo;
      </div>
      <a href="{inbox_url}" style="display: inline-block; color: {BRAND_COLOR}; font-size: 12px; font-weight: 600; text-decoration: none;">
        Review in inbox &rarr;
      </a>
    </div>"""


def render_weekly_summary_html(
    user_name: str,
    agent_name: str,
    summary: dict,
    unsubscribe_token: str | None = None,
) -> str:
    """Build the full weekly summary email HTML. Used by both send and preview."""
    first_name = user_name.split()[0] if user_name else "there"

    # Build activity summary line
    activity_parts = []
    if summary.get("deliberations_joined"):
        count = len(summary["deliberations_joined"])
        activity_parts.append(f"joined <strong>{count}</strong> deliberation{'s' if count != 1 else ''}")
    if summary.get("rankings_count"):
        activity_parts.append(f"ranked statements in <strong>{summary['rankings_count']}</strong> deliberation{'s' if summary['rankings_count'] != 1 else ''}")
    if summary.get("statements_proposed"):
        activity_parts.append(f"proposed <strong>{summary['statements_proposed']}</strong> consensus statement{'s' if summary['statements_proposed'] != 1 else ''}")

    if activity_parts:
        activity_summary = f"This week, {agent_name} " + ", ".join(activity_parts) + "."
    else:
        activity_summary = f"{agent_name} was quiet this week, but there are actions waiting for your review."

    # Consensus wins highlight
    wins_html = ""
    if summary.get("consensus_wins"):
        wins_list = "".join(
            f'<li style="color: #555; line-height: 1.6;"><em>{w["statement_title"]}</em> in &ldquo;{w["question"]}&rdquo;</li>'
            for w in summary["consensus_wins"]
        )
        wins_html = f"""
        <div style="background: #fef7f0; border-left: 3px solid {BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
          <strong style="color: {BRAND_COLOR};">&#127942; Consensus wins this week:</strong>
          <ul style="margin: 8px 0 0; padding-left: 20px;">{wins_list}</ul>
        </div>"""

    # Opinion action cards — the hook
    opinion_cards_html = ""
    opinion_actions = summary.get("opinion_actions", [])
    for action in opinion_actions[:5]:  # Limit to 5 to keep email reasonable
        opinion_cards_html += _render_opinion_card(action, agent_name)

    # Statement action cards
    statement_cards_html = ""
    statement_actions = summary.get("statement_actions", [])
    for action in statement_actions[:3]:
        statement_cards_html += _render_statement_card(action, agent_name)

    # Pending review nudge
    pending_html = ""
    pending_count = summary.get("pending_review_count", 0)
    if pending_count > 0:
        pending_html = f"""
        <div style="background: #fef3c7; border-radius: 6px; padding: 14px 16px; margin: 16px 0; text-align: center;">
          <div style="font-size: 14px; color: #92400e; font-weight: 600; margin-bottom: 4px;">
            {pending_count} action{'s' if pending_count != 1 else ''} waiting for your review
          </div>
          <div style="font-size: 12px; color: #a16207;">
            Make sure {agent_name} is representing you well.
          </div>
        </div>"""

    # Section header for opinions
    opinions_header = ""
    if opinion_cards_html:
        opinions_header = f"""
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 600; margin: 20px 0 4px; padding-top: 16px; border-top: 1px solid #eee;">
          Here&rsquo;s what {agent_name} said on your behalf
        </div>"""

    # Section header for statements
    statements_header = ""
    if statement_cards_html:
        statements_header = f"""
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 600; margin: 20px 0 4px; padding-top: 16px; border-top: 1px solid #eee;">
          Consensus statements proposed
        </div>"""

    body = f"""
    <tr>
      <td style="padding: 24px 32px;">
        <h2 style="margin: 0 0 12px; font-size: 22px; color: #333;">Weekly update for {agent_name}</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 8px;">
          Hi {first_name}, {activity_summary}
        </p>
        {wins_html}
        {pending_html}
        {opinions_header}
        {opinion_cards_html}
        {statements_header}
        {statement_cards_html}
        <div style="text-align: center; margin: 28px 0 16px;">
          <a href="{settings.FRONTEND_URL}/inbox"
             style="display: inline-block; background: {BRAND_COLOR}; color: #fff; padding: 14px 32px;
                    border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Open Inbox
          </a>
        </div>
        <p style="color: #888; font-size: 13px; margin: 16px 0 0; line-height: 1.5; text-align: center;">
          Want {agent_name} to take a different stance?
          <a href="{settings.FRONTEND_URL}/inbox" style="color: {BRAND_COLOR};">Review and correct in your inbox</a>.
        </p>
      </td>
    </tr>
    """

    return _email_wrapper(body, unsubscribe_token)


def send_weekly_summary_email(
    db: Session,
    to_email: str,
    user_name: str,
    agent_name: str,
    summary: dict,
    unsubscribe_token: str,
) -> bool:
    """Send weekly agent activity summary. Returns True if sent."""
    _init_resend()

    html = render_weekly_summary_html(user_name, agent_name, summary, unsubscribe_token)

    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": to_email,
            "subject": f"This week: {agent_name}'s deliberation summary",
            "html": html,
            "headers": {
                "List-Unsubscribe": f"<{_unsubscribe_url(unsubscribe_token)}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
        })
        logger.info("Weekly summary sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send weekly summary to %s: %s", to_email, e)
        return False
