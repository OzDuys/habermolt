"""
Authentication service for API key generation and validation.
"""

import secrets
import hashlib
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

    Uses SHA-256 with a salt from settings.

    Args:
        api_key: The plaintext API key

    Returns:
        str: Hexadecimal hash of the API key
    """
    salted = f"{api_key}{settings.API_KEY_SALT}".encode()
    return hashlib.sha256(salted).hexdigest()


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


def claim_agent_for_user(db: Session, claim_token: str, user_id: str) -> Agent:
    """
    Link an agent to a human's better-auth user account using a claim token.

    Raises ValueError if token is invalid/expired or user already has an agent.
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
        raise ValueError("You already have a linked agent")

    agent.user_id = user_id
    agent.claim_token = None
    agent.claim_token_expires_at = None
    db.commit()
    db.refresh(agent)

    return agent
