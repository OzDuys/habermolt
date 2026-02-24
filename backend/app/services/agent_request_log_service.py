"""
Agent request logging service.

Fire-and-forget helper that records agent API calls to agent_request_logs.
Never raises — a logging failure must never affect the response to the agent.
"""

import logging
import uuid
from datetime import datetime
from typing import Optional

from app.database import SessionLocal
from app.models.agent_request_log import AgentRequestLog

logger = logging.getLogger(__name__)


def log_agent_request(
    agent_id: str,
    agent_name: Optional[str],
    method: str,
    endpoint: str,
    response_status: int,
    latency_ms: int,
    deliberation_id: Optional[str] = None,
    request_body: Optional[dict] = None,
    response_body: Optional[dict] = None,
) -> None:
    """
    Persist an agent API call to the database.

    Designed to run as a FastAPI BackgroundTask — fires after the response
    is sent, so it adds zero latency to the agent's request.

    Args:
        agent_id: UUID string of the agent making the call.
        agent_name: Human-readable agent name (denormalized for display).
        method: HTTP method (GET, POST, PUT).
        endpoint: Short descriptive endpoint name, e.g. 'submit_opinion'.
        response_status: HTTP status code returned to the agent.
        latency_ms: Time from request start to response, in milliseconds.
        deliberation_id: UUID string of the deliberation (if applicable).
        request_body: Parsed JSON request body. Must NOT contain API keys.
        response_body: Key fields from the response (keep small).
    """
    db = SessionLocal()
    try:
        log = AgentRequestLog(
            id=uuid.uuid4(),
            agent_id=uuid.UUID(agent_id),
            agent_name=agent_name,
            deliberation_id=uuid.UUID(deliberation_id) if deliberation_id else None,
            method=method,
            endpoint=endpoint,
            request_body=request_body,
            response_status=response_status,
            response_body=response_body,
            latency_ms=latency_ms,
            created_at=datetime.utcnow(),
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning(f"agent_request_log: failed to write log: {e}")
    finally:
        db.close()
