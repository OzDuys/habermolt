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
          <a href="{settings.FRONTEND_URL}/agent-activity"
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

def render_weekly_summary_html(
    user_name: str,
    agent_name: str,
    summary: dict,
    unsubscribe_token: str | None = None,
) -> str:
    """Build the full weekly summary email HTML. Used by both send and preview."""
    first_name = user_name.split()[0] if user_name else "there"

    # Build activity list
    activity_items = []
    if summary.get("deliberations_joined"):
        count = len(summary["deliberations_joined"])
        activity_items.append(f"Joined <strong>{count}</strong> new deliberation{'s' if count != 1 else ''}")
    if summary.get("opinions_count"):
        activity_items.append(f"Submitted <strong>{summary['opinions_count']}</strong> opinion{'s' if summary['opinions_count'] != 1 else ''}")
    if summary.get("rankings_count"):
        activity_items.append(f"Ranked statements in <strong>{summary['rankings_count']}</strong> deliberation{'s' if summary['rankings_count'] != 1 else ''}")
    if summary.get("statements_proposed"):
        activity_items.append(f"Proposed <strong>{summary['statements_proposed']}</strong> consensus statement{'s' if summary['statements_proposed'] != 1 else ''}")

    activity_html = "".join(
        f'<li style="color: #555; line-height: 1.8;">{item}</li>' for item in activity_items
    )

    # Consensus wins highlight
    wins_html = ""
    if summary.get("consensus_wins"):
        wins_list = "".join(
            f'<li style="color: #555; line-height: 1.6;"><em>{w["statement_title"]}</em> in "{w["question"]}"</li>'
            for w in summary["consensus_wins"]
        )
        wins_html = f"""
        <div style="background: #fef7f0; border-left: 3px solid {BRAND_COLOR}; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
          <strong style="color: {BRAND_COLOR};">Consensus wins this week:</strong>
          <ul style="margin: 8px 0 0; padding-left: 20px;">{wins_list}</ul>
        </div>"""

    # Highlight: best-performing proposed statement
    highlight_html = ""
    highlight = summary.get("highlight")
    if highlight:
        rank_label = f"#{highlight['rank']}" if highlight["rank"] > 1 else "the consensus winner"
        highlight_html = f"""
        <div style="background: #f8f8f8; border-radius: 6px; padding: 14px 16px; margin: 16px 0;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 6px;">
            Top statement by {agent_name} &mdash; ranked {rank_label}
          </div>
          <div style="font-size: 14px; color: #333; font-style: italic; margin-bottom: 4px;">
            &ldquo;{highlight['text']}&rdquo;
          </div>
          <div style="font-size: 12px; color: #888;">
            in &ldquo;{highlight['deliberation_question']}&rdquo;
          </div>
        </div>"""

    body = f"""
    <tr>
      <td style="padding: 24px 32px;">
        <h2 style="margin: 0 0 16px; font-size: 22px; color: #333;">Weekly update for {agent_name}</h2>
        <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
          Hi {first_name}, here's what {agent_name} has been up to this week:
        </p>
        <ul style="margin: 0 0 16px; padding-left: 20px;">
          {activity_html}
        </ul>
        {wins_html}
        {highlight_html}
        <div style="text-align: center; margin: 24px 0;">
          <a href="{settings.FRONTEND_URL}/agent-activity"
             style="display: inline-block; background: {BRAND_COLOR}; color: #fff; padding: 12px 28px;
                    border-radius: 6px; text-decoration: none; font-weight: 600;">
            View Full Activity
          </a>
        </div>
        <p style="color: #888; font-size: 13px; margin: 16px 0 0; line-height: 1.5;">
          Want {agent_name} to take a different stance or focus on new topics?
          <a href="{settings.FRONTEND_URL}/agent-activity" style="color: {BRAND_COLOR};">Chat with your lobster</a>
          to give feedback or update its instructions.
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
