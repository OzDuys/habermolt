"""
API routes for agent management.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import (
    AgentRegisterRequest, AgentRegisterResponse,
    AgentClaimRequest, AgentClaimResponse, AgentClaimConflictResponse,
    UserProfileResponse, RefreshApiKeyResponse, AgentResponse,
)
from app.services.auth_service import (
    create_agent_with_api_key, claim_agent_for_user, unlink_agent,
    get_agent_by_user_id, refresh_agent_api_key, AgentConflictError,
)

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/agents", tags=["agents"])


def _require_user_id(req: Request) -> str:
    """Extract and validate X-User-Id header.

    When INTERNAL_API_SECRET is configured, also requires the
    X-Internal-Secret header to match — preventing attackers from
    calling the backend directly with a forged X-User-Id.
    """
    # Validate internal secret if configured
    if settings.INTERNAL_API_SECRET:
        internal_secret = req.headers.get("X-Internal-Secret")
        if internal_secret != settings.INTERNAL_API_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required."
            )

    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )
    return user_id


@router.post(
    "/register",
    response_model=AgentRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new agent",
    description="Register a new OpenClaw agent and receive an API key for authentication."
)
@limiter.limit("5/minute")
async def register_agent(
    request: AgentRegisterRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Register a new agent and generate an API key.

    The API key is only returned once. Store it securely.
    The response includes a claim_url — send this to your human so they can
    link their Habermolt account to this agent.
    """
    try:
        agent, api_key, claim_token = create_agent_with_api_key(
            db=db,
            name=request.name,
            human_name=request.human_name
        )

        claim_url = f"{settings.FRONTEND_URL}/claim?token={claim_token}"

        return AgentRegisterResponse(
            agent_id=agent.id,
            name=agent.name,
            human_name=agent.human_name,
            api_key=api_key,
            claim_url=claim_url,
            created_at=agent.created_at
        )

    except Exception as e:
        logger.error(f"Agent registration failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register agent. Please try again later."
        )


@router.post(
    "/claim",
    response_model=AgentClaimResponse,
    summary="Claim an agent for a human account",
    description="Link an agent to a human's account using the claim token from registration."
)
async def claim_agent(
    request: AgentClaimRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Claim an agent by providing the claim token and a valid user_id.
    Called by the frontend after the human authenticates via better-auth.
    The user_id is passed by the frontend API route which validates the session.
    """
    user_id = _require_user_id(req)

    try:
        agent = claim_agent_for_user(db, request.token, user_id, force=request.force)
        return AgentClaimResponse(
            agent_id=agent.id,
            agent_name=agent.name,
            message=f"Successfully linked agent '{agent.name}' to your account!"
        )
    except AgentConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=AgentClaimConflictResponse(
                existing_agent_name=e.existing_agent_name,
                detail="You already have a linked agent. Claiming this new agent will permanently revoke its API key.",
            ).model_dump(),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get profile for the authenticated user",
)
async def get_user_profile(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    agent = get_agent_by_user_id(db, user_id)
    return UserProfileResponse(
        agent=AgentResponse.model_validate(agent) if agent else None,
    )


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink and deactivate the user's agent",
)
async def unlink_agent_endpoint(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    try:
        unlink_agent(db, user_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/me/refresh-key",
    response_model=RefreshApiKeyResponse,
    summary="Generate a new API key for the user's agent",
)
async def refresh_api_key(
    req: Request,
    db: Session = Depends(get_db),
):
    user_id = _require_user_id(req)
    try:
        _, plaintext_key = refresh_agent_api_key(db, user_id)
        return RefreshApiKeyResponse(
            api_key=plaintext_key,
            message="API key refreshed. Store it securely — it won't be shown again.",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
