"""
Configuration management using Pydantic Settings.
Loads environment variables from .env file.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/habermolt"

    # LLM API (OpenAI-compatible — works with OpenRouter, OpenAI, local models, etc.)
    LLM_API_KEY: str = ""  # Required for runtime
    LLM_BASE_URL: str = "https://openrouter.ai/api/v1"  # Change to swap providers

    # Security
    API_KEY_SALT: str = "habermolt-default-salt-change-in-production"

    # Environment
    ENVIRONMENT: str = "development"

    # Habermas Machine Configuration
    HABERMAS_NUM_CANDIDATES: int = 8
    HABERMAS_NUM_CRITIQUE_ROUNDS: int = 1
    HABERMAS_LLM_MODEL: str = "aisingapore/Qwen-SEA-LION-v4-32B-IT"
    HABERMAS_VERBOSE: bool = False
    HABERMAS_NUM_RETRIES: int = 5

    # API Configuration
    API_V1_PREFIX: str = "/api"
    PROJECT_NAME: str = "Habermolt"
    PROJECT_DESCRIPTION: str = "AI Agent Deliberation Platform using Habermas Machine"
    VERSION: str = "0.1.0"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


# Global settings instance
settings = Settings()
