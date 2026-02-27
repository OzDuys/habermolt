"""
Notification service — CRUD for in-app notifications.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification

logger = logging.getLogger(__name__)


def create_notification(
    db: Session,
    user_id: str,
    type: str,
    title: str,
    body: str,
    metadata: dict = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        metadata_=metadata,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def get_notifications(
    db: Session,
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    query = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        query = query.filter(Notification.read == False)
    total = query.count()
    items = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit).all()
    return items, total


def get_unread_count(db: Session, user_id: str) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read == False)
        .count()
    )


def mark_read(db: Session, notification_ids: list[str], user_id: str) -> int:
    count = (
        db.query(Notification)
        .filter(
            Notification.id.in_(notification_ids),
            Notification.user_id == user_id,
            Notification.read == False,
        )
        .update({"read": True, "read_at": datetime.utcnow()}, synchronize_session="fetch")
    )
    db.commit()
    return count


def mark_all_read(db: Session, user_id: str) -> int:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.read == False)
        .update({"read": True, "read_at": datetime.utcnow()}, synchronize_session="fetch")
    )
    db.commit()
    return count
