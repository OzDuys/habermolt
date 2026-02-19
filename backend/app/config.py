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

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # Security
    API_KEY_SALT: str = "habermolt-default-salt-change-in-production"

    # Environment
    ENVIRONMENT: str = "development"

    # Habermas Machine Configuration
    HABERMAS_NUM_CANDIDATES: int = 6
    HABERMAS_NUM_CRITIQUE_ROUNDS: int = 1
    HABERMAS_CRITIQUE_ENABLED: bool = False  # Skip critique stage; go ranking → concluded
    HABERMAS_LLM_MODEL: str = "anthropic/claude-sonnet-4.6"
    HABERMAS_LLM_MODELS: str = "x-ai/grok-4.1-fast, arcee-ai/trinity-large-preview:free, minimax/minimax-m2.5, moonshotai/kimi-k2.5, z-ai/glm-5, google/gemini-3-flash-preview, deepseek/deepseek-v3.2"  # Comma-separated list of models; cycles if fewer than NUM_CANDIDATES
    HABERMAS_LLM_TEMPERATURE: float = 0.8
    HABERMAS_VERBOSE: bool = False
    HABERMAS_NUM_RETRIES: int = 5

    @property
    def habermas_model_list(self) -> list[str]:
        """Parse HABERMAS_LLM_MODELS into a list. Falls back to single HABERMAS_LLM_MODEL."""
        if self.HABERMAS_LLM_MODELS:
            return [m.strip() for m in self.HABERMAS_LLM_MODELS.split(",") if m.strip()]
        return [self.HABERMAS_LLM_MODEL]

    # Continuous Mechanism Configuration
    CONTINUOUS_NUM_SEED_STATEMENTS: int = 4  # Initial LLM-generated statements
    CONTINUOUS_NUM_SEED_OPINIONS: int = 4  # Synthetic opinions for seed generation
    CONTINUOUS_MAX_STATEMENTS: int = 32  # Hard cap on statement pool
    CONTINUOUS_MAX_STATEMENTS_PER_AGENT: int = 3  # Per-agent contribution limit

    # Similarity checking for duplicate deliberation detection
    # Model name for embeddings — OpenRouter format by default.
    # If using direct OpenAI, change to "text-embedding-3-small".
    EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    # Cosine similarity threshold above which deliberations are considered too similar (0–1).
    SIMILARITY_THRESHOLD: float = 0.85

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
