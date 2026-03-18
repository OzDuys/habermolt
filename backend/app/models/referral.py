"""
Referral tracking models.

ReferralCode: stores each user's unique referral code.
Referral: records a successful referral (one user brought another).
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class ReferralCode(Base):
    __tablename__ = "referral_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, unique=True, nullable=False, index=True)
    code = Column(String(12), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id = Column(String, nullable=False, index=True)
    referred_user_id = Column(String, unique=True, nullable=False, index=True)
    converted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
