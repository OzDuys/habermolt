"""
Authentication service for API key generation and validation.
"""

import secrets
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Agent
from app.config import settings

CLAIM_TOKEN_EXPIRY_HOURS = 24


def generate_api_key() -> str:
    """
    Generate a secure random API key.

    Returns:
        str: A URL-safe 32-byte random API key
    """
    return secrets.token_urlsafe(32)


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key for secure storage.

    Uses HMAC-SHA256 with the API_KEY_SALT as the secret key.
    This is the industry-standard approach for API key hashing
    (used by Stripe, GitHub, etc.) — fast enough for DB lookups
    but secure even if the database is compromised, as long as
    the HMAC secret is not stored in the database.

    Args:
        api_key: The plaintext API key

    Returns:
        str: Hexadecimal HMAC digest of the API key
    """
    return hmac.new(
        settings.API_KEY_SALT.encode(),
        api_key.encode(),
        hashlib.sha256,
    ).hexdigest()


def verify_api_key(db: Session, api_key: str) -> Optional[Agent]:
    """
    Verify an API key and return the associated agent.

    Args:
        db: Database session
        api_key: The plaintext API key to verify

    Returns:
        Agent if the key is valid, None otherwise
    """
    hashed = hash_api_key(api_key)
    agent = db.query(Agent).filter(Agent.api_key == hashed).first()
    return agent


def create_agent_with_api_key(
    db: Session,
    name: str,
    human_name: str
) -> tuple[Agent, str, str]:
    """
    Create a new agent with a generated API key.

    Args:
        db: Database session
        name: Agent's display name
        human_name: Name of the human the agent represents

    Returns:
        tuple: (Agent instance, plaintext API key)
               The plaintext key is only returned once and must be stored by the caller.
    """
    # Generate and hash API key
    plaintext_key = generate_api_key()
    hashed_key = hash_api_key(plaintext_key)

    # Generate claim token for human account linking
    plaintext_claim_token = secrets.token_urlsafe(32)
    hashed_claim_token = hash_api_key(plaintext_claim_token)

    # Create agent
    agent = Agent(
        name=name,
        human_name=human_name,
        api_key=hashed_key,
        claim_token=hashed_claim_token,
        claim_token_expires_at=datetime.utcnow() + timedelta(hours=CLAIM_TOKEN_EXPIRY_HOURS),
    )

    db.add(agent)
    db.commit()
    db.refresh(agent)

    # Return agent, plaintext key, and plaintext claim token
    return agent, plaintext_key, plaintext_claim_token


def get_agent_by_user_id(db: Session, user_id: str) -> Optional[Agent]:
    """Return the agent linked to a user, or None."""
    return db.query(Agent).filter(Agent.user_id == user_id).first()


def refresh_agent_api_key(db: Session, user_id: str) -> tuple[Agent, str]:
    """
    Generate a new API key for the agent linked to the given user.

    Returns:
        tuple: (Agent, plaintext new API key)

    Raises:
        ValueError: If no agent is linked to this user.
    """
    agent = get_agent_by_user_id(db, user_id)
    if not agent:
        raise ValueError("No agent linked to this account")

    plaintext_key = generate_api_key()
    agent.api_key = hash_api_key(plaintext_key)
    db.commit()
    db.refresh(agent)
    return agent, plaintext_key


class AgentConflictError(Exception):
    """Raised when a user tries to claim an agent but already has one linked."""
    def __init__(self, existing_agent_name: str):
        self.existing_agent_name = existing_agent_name
        super().__init__(f"Already linked to agent '{existing_agent_name}'")


def unlink_agent(db: Session, user_id: str) -> None:
    """
    Unlink and deactivate the agent linked to the given user.
    Nulls out user_id and api_key so the agent can no longer authenticate.
    Historical deliberation data is preserved.

    Raises ValueError if no agent is linked.
    """
    agent = get_agent_by_user_id(db, user_id)
    if not agent:
        raise ValueError("No agent linked to this account")

    agent.user_id = None
    agent.api_key = None
    db.commit()


def claim_agent_for_user(db: Session, claim_token: str, user_id: str, force: bool = False) -> Agent:
    """
    Link an agent to a human's better-auth user account using a claim token.

    If the user already has a linked agent and force=False, raises AgentConflictError.
    If force=True, the existing agent is unlinked (api_key nulled) before claiming.

    Raises ValueError if token is invalid/expired or already claimed by another user.
    """
    hashed = hash_api_key(claim_token)
    agent = db.query(Agent).filter(Agent.claim_token == hashed).first()

    if not agent:
        raise ValueError("Invalid claim token")

    if agent.claim_token_expires_at and agent.claim_token_expires_at < datetime.utcnow():
        raise ValueError("Claim token has expired")

    if agent.user_id:
        raise ValueError("Agent is already claimed")

    # Check if user already has an agent
    existing = db.query(Agent).filter(Agent.user_id == user_id).first()
    if existing:
        if not force:
            raise AgentConflictError(existing.name)
        # Unlink and deactivate the old agent
        existing.user_id = None
        existing.api_key = None

    agent.user_id = user_id
    agent.claim_token = None
    agent.claim_token_expires_at = None
    db.commit()
    db.refresh(agent)

    return agent
