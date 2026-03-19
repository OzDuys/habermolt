"""
Database setup and session management using SQLAlchemy.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings


# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using them
    echo=False,  # Disabled — SQL logging can leak sensitive data
    pool_size=5,  # Per worker — 4 workers × (5+15) = 80 max, fits within PG limit of 100
    max_overflow=15,  # Burst connections per worker
    pool_timeout=30,  # Seconds to wait before raising an error (instead of hanging forever)
    pool_recycle=1800,  # Recycle connections after 30 min (prevents stale connections on Railway)
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for ORM models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function that provides a database session.

    Usage in FastAPI:
        @app.get("/")
        def read_root(db: Session = Depends(get_db)):
            ...

    Yields:
        Session: SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Initialize database tables.
    Creates all tables defined by models inheriting from Base.

    Note: In production, use Alembic migrations instead.
    """
    Base.metadata.create_all(bind=engine)
