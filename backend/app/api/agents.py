"""
API routes for agent management.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas import AgentRegisterRequest, AgentRegisterResponse, AgentClaimRequest, AgentClaimResponse
from app.services.auth_service import create_agent_with_api_key, claim_agent_for_user


router = APIRouter(prefix="/agents", tags=["agents"])


@router.post(
    "/register",
    response_model=AgentRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new agent",
    description="Register a new OpenClaw agent and receive an API key for authentication."
)
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

        # Derive origin from request headers (works behind ngrok/proxies)
        proto = req.headers.get("x-forwarded-proto", "http")
        host = req.headers.get("x-forwarded-host") or req.headers.get("host") or "localhost:3000"
        origin = f"{proto}://{host}"
        claim_url = f"{origin}/claim?token={claim_token}"

        return AgentRegisterResponse(
            agent_id=agent.id,
            name=agent.name,
            human_name=agent.human_name,
            api_key=api_key,
            claim_url=claim_url,
            created_at=agent.created_at
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register agent: {str(e)}"
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
    # The user_id comes from the X-User-Id header, set by the frontend API route
    # after validating the better-auth session
    user_id = req.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in first."
        )

    try:
        agent = claim_agent_for_user(db, request.token, user_id)
        return AgentClaimResponse(
            agent_id=agent.id,
            agent_name=agent.name,
            message=f"Successfully linked agent '{agent.name}' to your account!"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
