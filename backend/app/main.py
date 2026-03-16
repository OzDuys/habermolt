"""
Main FastAPI application for the Habermolt platform.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging

from app.config import settings
from app.api import agent_status, agents, categories, communities, continuous, deliberation_chat, deliberations, feedback, hosted_agents, monitoring, notifications, private_deliberations, stats, waitlist


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Rate limiter (shared across all routers)
limiter = Limiter(key_func=get_remote_address)

# CORS origins (used by lifespan logging and middleware)
cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]


# ---------------------------------------------------------------------------
# Background heartbeat loop
# ---------------------------------------------------------------------------

HEARTBEAT_CHECK_INTERVAL_SECONDS = 5 * 60  # 5 minutes


async def _heartbeat_loop():
    """Periodically run heartbeats for all eligible hosted agents."""
    from app.database import SessionLocal
    from app.services.hosted_agent_runner import run_all_hosted_agents

    logger.info("Heartbeat background loop started (interval=%ds)", HEARTBEAT_CHECK_INTERVAL_SECONDS)

    # Let the server finish starting up before the first run
    await asyncio.sleep(60)

    while True:
        try:
            db = SessionLocal()
            try:
                results = await asyncio.to_thread(run_all_hosted_agents, db)
                logger.info(
                    "Heartbeat loop: %d ran, %d skipped, %d errors (of %d total)",
                    results["ran"], results["skipped"], results["errors"], results["total"],
                )
            finally:
                db.close()
        except Exception as e:
            logger.error("Heartbeat loop error: %s", e, exc_info=True)

        await asyncio.sleep(HEARTBEAT_CHECK_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated on_event("startup") / on_event("shutdown"))
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup & shutdown logic."""
    import threading
    from app.services.categorization_service import backfill_uncategorized

    # Security check: reject default salt in production
    if settings.ENVIRONMENT != "development":
        if settings.API_KEY_SALT == "habermolt-default-salt-change-in-production":
            raise RuntimeError(
                "CRITICAL: API_KEY_SALT is set to the default value. "
                "Set a secure random value via the API_KEY_SALT environment variable."
            )
        if not settings.INTERNAL_API_SECRET:
            logger.warning(
                "INTERNAL_API_SECRET is not set. "
                "X-User-Id header validation is disabled — backend endpoints "
                "that trust this header are vulnerable to spoofing."
            )

    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"CORS origins: {cors_origins}")
    models = settings.habermas_model_list
    logger.info(
        f"Deliberation config: {settings.HABERMAS_NUM_CANDIDATES} candidates, "
        f"{len(models)} models"
    )
    for i, model in enumerate(models):
        logger.info(f"  Model {i + 1}: {model}")

    # Back-fill category for any deliberations created before categorisation was added
    thread = threading.Thread(target=backfill_uncategorized, daemon=True)
    thread.start()

    # Start automatic heartbeat loop (production only, when enabled)
    heartbeat_task = None
    if settings.HEARTBEAT_LOOP_ENABLED and settings.ENVIRONMENT != "development":
        heartbeat_task = asyncio.create_task(_heartbeat_loop())
    else:
        logger.info("Heartbeat loop disabled (HEARTBEAT_LOOP_ENABLED=%s, ENVIRONMENT=%s)",
                     settings.HEARTBEAT_LOOP_ENABLED, settings.ENVIRONMENT)

    yield

    # Shutdown
    if heartbeat_task is not None:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        logger.info("Heartbeat loop stopped")
    logger.info(f"Shutting down {settings.PROJECT_NAME}")


# ---------------------------------------------------------------------------
# Create FastAPI app
# ---------------------------------------------------------------------------

# Disable docs in production
app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT == "development" else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# CORS middleware — restrict to configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors."""
    logger.error(f"Validation error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors()
        }
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle database errors."""
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Database error occurred"}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions."""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )


# Health check endpoint
@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint for monitoring.

    Returns:
        dict: Health status
    """
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT
    }


# Root endpoint
@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint with API information.

    Returns:
        dict: API information
    """
    return {
        "name": settings.PROJECT_NAME,
        "description": settings.PROJECT_DESCRIPTION,
        "version": settings.VERSION,
        "docs_url": "/docs" if settings.ENVIRONMENT == "development" else None,
        "health_url": "/health"
    }


# Include API routers
app.include_router(agent_status.router, prefix=settings.API_V1_PREFIX)
app.include_router(agents.router, prefix=settings.API_V1_PREFIX)
app.include_router(categories.router, prefix=settings.API_V1_PREFIX)
app.include_router(communities.router, prefix=settings.API_V1_PREFIX)
app.include_router(private_deliberations.router, prefix=settings.API_V1_PREFIX)
app.include_router(deliberations.router, prefix=settings.API_V1_PREFIX)
app.include_router(continuous.router, prefix=settings.API_V1_PREFIX)
app.include_router(feedback.router, prefix=settings.API_V1_PREFIX)
app.include_router(stats.router, prefix=settings.API_V1_PREFIX)
app.include_router(monitoring.router, prefix=settings.API_V1_PREFIX)
app.include_router(hosted_agents.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(deliberation_chat.router, prefix=settings.API_V1_PREFIX)
app.include_router(waitlist.router, prefix=settings.API_V1_PREFIX)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development"
    )
