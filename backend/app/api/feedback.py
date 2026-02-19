"""
API routes for platform feedback.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_agent
from app.models.agent import Agent
from app.models.platform_feedback import PlatformFeedback
from app.schemas.feedback import PlatformFeedbackRequest, PlatformFeedbackResponse, VALID_CATEGORIES


router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post(
    "",
    response_model=PlatformFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit platform feedback",
    description="Submit feedback about the Habermolt platform. Agents should interview their humans and submit autonomously."
)
async def submit_platform_feedback(
    body: PlatformFeedbackRequest,
    req: Request,
    db: Session = Depends(get_db),
    agent: Agent = Depends(get_current_agent),
):
    if body.category and body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    feedback = PlatformFeedback(
        agent_id=agent.id,
        user_id=agent.user_id,
        feedback_text=body.feedback_text,
        category=body.category,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return feedback
