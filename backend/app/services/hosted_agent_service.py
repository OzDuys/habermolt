"""
Hosted agent service — CRUD, token limits, BYOK key encryption, LLMClient factory.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Agent
from app.models.hosted_agent import HostedAgent
from app.services.auth_service import generate_api_key, hash_api_key
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

TOKEN_LIMITS = {
    "free": settings.HOSTED_AGENT_FREE_TOKEN_LIMIT,
    "subscription": settings.HOSTED_AGENT_SUBSCRIPTION_TOKEN_LIMIT,
    "byok": None,  # unlimited
}


def _get_fernet() -> Fernet:
    key = settings.HOSTED_AGENT_ENCRYPTION_KEY
    if not key:
        raise ValueError("HOSTED_AGENT_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def create_hosted_agent(
    db: Session,
    user_id: str,
    display_name: str,
    pricing_tier: str = "free",
    byok_api_key: str = None,
    model: str = None,
) -> HostedAgent:
    """Create a hosted agent with a shadow Agent record."""
    # Check if user already has a hosted agent
    existing = db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()
    if existing:
        raise ValueError("User already has a hosted agent")

    # Check if user already has a regular (OpenClaw) agent linked
    existing_agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if existing_agent:
        raise ValueError("User already has an OpenClaw agent linked. Unlink it first to create a hosted agent.")

    # Look up the human's real name from the better-auth user table
    row = db.execute(text('SELECT name FROM "user" WHERE id = :uid'), {"uid": user_id}).fetchone()
    human_name = row[0] if row and row[0] else display_name

    # Create shadow Agent record
    plaintext_key = generate_api_key()
    hashed_key = hash_api_key(plaintext_key)

    agent = Agent(
        name=display_name,
        human_name=human_name,
        api_key=hashed_key,
        user_id=user_id,
    )
    db.add(agent)
    db.flush()  # get agent.id before creating hosted_agent

    # Encrypt BYOK key if provided
    encrypted_key = None
    if byok_api_key and pricing_tier == "byok":
        encrypted_key = _get_fernet().encrypt(byok_api_key.encode()).decode()

    hosted_agent = HostedAgent(
        user_id=user_id,
        agent_id=agent.id,
        display_name=display_name,
        model=model or settings.HOSTED_AGENT_DEFAULT_MODEL,
        pricing_tier=pricing_tier,
        byok_api_key_encrypted=encrypted_key,
        billing_period_start=datetime.utcnow(),
    )
    db.add(hosted_agent)
    db.commit()
    db.refresh(hosted_agent)
    return hosted_agent


def get_hosted_agent_by_user(db: Session, user_id: str) -> Optional[HostedAgent]:
    return db.query(HostedAgent).filter(HostedAgent.user_id == user_id).first()


def update_hosted_agent(
    db: Session,
    hosted_agent: HostedAgent,
    display_name: str = None,
    model: str = None,
    participation_frequency: str = None,
    is_active: bool = None,
) -> HostedAgent:
    if display_name is not None:
        hosted_agent.display_name = display_name
        if hosted_agent.agent:
            hosted_agent.agent.name = display_name
    if model is not None:
        hosted_agent.model = model
    if participation_frequency is not None:
        if participation_frequency not in ("hourly", "daily", "weekly"):
            raise ValueError("participation_frequency must be hourly, daily, or weekly")
        hosted_agent.participation_frequency = participation_frequency
    if is_active is not None:
        hosted_agent.is_active = is_active
        if is_active:
            hosted_agent.paused_reason = None
        else:
            hosted_agent.paused_reason = "user_paused"
    db.commit()
    db.refresh(hosted_agent)
    return hosted_agent


def delete_hosted_agent(db: Session, hosted_agent: HostedAgent) -> None:
    """Delete hosted agent and deactivate its shadow Agent record."""
    from app.models.llm_trace import LLMTrace
    from app.models.agent_session import AgentSession

    # Nullify FK references in llm_traces so delete doesn't violate constraint
    db.query(LLMTrace).filter(LLMTrace.hosted_agent_id == hosted_agent.id).update(
        {"hosted_agent_id": None}
    )

    # Delete related sessions
    db.query(AgentSession).filter(AgentSession.agent_id == hosted_agent.agent_id).delete()

    agent = hosted_agent.agent
    if agent:
        agent.user_id = None
        agent.api_key = None
    db.delete(hosted_agent)
    db.commit()


def set_byok_key(db: Session, hosted_agent: HostedAgent, plaintext_key: str) -> None:
    hosted_agent.byok_api_key_encrypted = _get_fernet().encrypt(plaintext_key.encode()).decode()
    hosted_agent.pricing_tier = "byok"
    db.commit()


def remove_byok_key(db: Session, hosted_agent: HostedAgent) -> None:
    hosted_agent.byok_api_key_encrypted = None
    hosted_agent.pricing_tier = "free"
    db.commit()


def get_decrypted_byok_key(hosted_agent: HostedAgent) -> Optional[str]:
    if not hosted_agent.byok_api_key_encrypted:
        return None
    return _get_fernet().decrypt(hosted_agent.byok_api_key_encrypted.encode()).decode()


def get_llm_client(hosted_agent: HostedAgent) -> LLMClient:
    """Return an LLMClient configured for this hosted agent's tier."""
    if hosted_agent.pricing_tier == "byok" and hosted_agent.byok_api_key_encrypted:
        api_key = get_decrypted_byok_key(hosted_agent)
    else:
        api_key = settings.LLM_API_KEY

    return LLMClient(
        model_name=hosted_agent.model,
        api_key=api_key,
        base_url=settings.LLM_BASE_URL,
    )


def check_token_limit(hosted_agent: HostedAgent) -> bool:
    """Return True if the agent can proceed (under limit or unlimited).

    Also un-pauses the agent if it was paused for token_limit but is now
    under the limit (e.g. limit was raised or period reset).
    """
    _maybe_reset_billing_period(hosted_agent)
    limit = TOKEN_LIMITS.get(hosted_agent.pricing_tier)
    if limit is None:
        if hosted_agent.paused_reason == "token_limit":
            hosted_agent.is_active = True
            hosted_agent.paused_reason = None
        return True
    under_limit = hosted_agent.tokens_used_period < limit
    if under_limit and hosted_agent.paused_reason == "token_limit":
        hosted_agent.is_active = True
        hosted_agent.paused_reason = None
    return under_limit


def track_untracked_tokens(db: Session, hosted_agent: HostedAgent) -> int:
    """Find all untracked LLM traces for this hosted agent, mark them tracked,
    and add their tokens to the usage counter. Returns total new tokens tracked.

    Idempotent: each trace is counted exactly once via the tokens_tracked flag.
    """
    from app.models.llm_trace import LLMTrace

    traces = (
        db.query(LLMTrace)
        .filter(
            LLMTrace.hosted_agent_id == hosted_agent.id,
            LLMTrace.tokens_tracked == False,  # noqa: E712
            LLMTrace.tokens_in.isnot(None),
            LLMTrace.tokens_out.isnot(None),
        )
        .all()
    )

    total = 0
    for trace in traces:
        total += trace.tokens_in + trace.tokens_out
        trace.tokens_tracked = True

    if total > 0:
        record_token_usage(db, hosted_agent, total)

    return total


def record_token_usage(db: Session, hosted_agent: HostedAgent, tokens: int) -> None:
    """Record token usage and pause if limit reached."""
    _maybe_reset_billing_period(hosted_agent)
    hosted_agent.tokens_used_period += tokens

    limit = TOKEN_LIMITS.get(hosted_agent.pricing_tier)
    if limit is not None and hosted_agent.tokens_used_period >= limit:
        hosted_agent.is_active = False
        hosted_agent.paused_reason = "token_limit"
        logger.info(f"Hosted agent {hosted_agent.id} paused: token limit reached ({hosted_agent.tokens_used_period}/{limit})")

    db.commit()


def _maybe_reset_billing_period(hosted_agent: HostedAgent) -> None:
    """Lazy reset: if 7 days have passed, reset the counter."""
    if datetime.utcnow() - hosted_agent.billing_period_start > timedelta(days=7):
        hosted_agent.tokens_used_period = 0
        hosted_agent.billing_period_start = datetime.utcnow()
        if hosted_agent.paused_reason == "token_limit":
            hosted_agent.is_active = True
            hosted_agent.paused_reason = None
