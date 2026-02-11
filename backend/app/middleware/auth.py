"""
Authentication middleware for API key validation.
"""

from fastapi import Request, HTTPException, status
from fastapi.security import APIKeyHeader
from typing import Optional

from app.models import Agent
from app.services.auth_service import verify_api_key
from app.database import SessionLocal


# Define API key header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_current_agent(
    api_key: Optional[str] = None,
    request: Request = None
) -> Agent:
    """
    Dependency for extracting and validating API key from request headers.

    Args:
        api_key: API key from X-API-Key header
        request: FastAPI request object

    Returns:
        Agent: The authenticated agent

    Raises:
        HTTPException: 401 if API key is missing or invalid
    """
    # Try to get API key from header
    if not api_key and request:
        api_key = request.headers.get("X-API-Key")

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key missing. Include X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Verify API key
    db = SessionLocal()
    try:
        agent = verify_api_key(db, api_key)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        return agent
    finally:
        db.close()


class APIKeyAuth:
    """
    Dependency class for API key authentication.

    Usage:
        @app.get("/protected")
        async def protected_route(agent: Agent = Depends(APIKeyAuth())):
            return {"agent": agent.name}
    """

    async def __call__(self, request: Request) -> Agent:
        """Extract and validate API key from request."""
        api_key = request.headers.get("X-API-Key")
        return await get_current_agent(api_key=api_key, request=request)


class OptionalAPIKeyAuth:
    """
    Dependency class for optional API key authentication.
    Returns None if no API key is provided (e.g. public frontend requests).
    """

    async def __call__(self, request: Request) -> Optional[Agent]:
        """Extract and validate API key if present, otherwise return None."""
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            return None
        try:
            return await get_current_agent(api_key=api_key, request=request)
        except HTTPException:
            return None
