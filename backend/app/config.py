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
    HABERMAS_NUM_CANDIDATES: int = 6
    HABERMAS_NUM_CRITIQUE_ROUNDS: int = 1
    HABERMAS_CRITIQUE_ENABLED: bool = False  # Skip critique stage; go ranking → concluded
    HABERMAS_LLM_MODEL: str = "aisingapore/Qwen-SEA-LION-v4-32B-IT"
    HABERMAS_LLM_MODELS: str = "aisingapore/Qwen-SEA-LION-v4-32B-IT,allenai/Molmo2-8B,dicta-il/DictaLM-3.0-24B-Thinking,allenai/Olmo-3-7B-Instruct,aisingapore/Gemma-SEA-LION-v4-27B-IT,swiss-ai/apertus-70b-instruct"  # Comma-separated list of models; cycles if fewer than NUM_CANDIDATES
    HABERMAS_LLM_TEMPERATURE: float = 0.8
    HABERMAS_VERBOSE: bool = False
    HABERMAS_NUM_RETRIES: int = 5

    @property
    def habermas_model_list(self) -> list[str]:
        """Parse HABERMAS_LLM_MODELS into a list. Falls back to single HABERMAS_LLM_MODEL."""
        if self.HABERMAS_LLM_MODELS:
            return [m.strip() for m in self.HABERMAS_LLM_MODELS.split(",") if m.strip()]
        return [self.HABERMAS_LLM_MODEL]

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
