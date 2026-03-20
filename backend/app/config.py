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
    INTERNAL_API_SECRET: str = ""  # Shared secret between frontend and backend for X-User-Id trust
    CORS_ORIGINS: str = "http://localhost:3000"  # Comma-separated allowed origins

    # Monitoring
    MONITORING_SECRET: str = ""  # Secret for accessing /api/monitoring/* endpoints
    MONITORING_ALLOWED_USERS: str = ""  # Comma-separated user IDs allowed to access monitoring

    @property
    def monitoring_allowed_user_list(self) -> list[str]:
        """Parse MONITORING_ALLOWED_USERS into a list."""
        if self.MONITORING_ALLOWED_USERS:
            return [u.strip() for u in self.MONITORING_ALLOWED_USERS.split(",") if u.strip()]
        return []

    # Email (Resend)
    RESEND_API_KEY: str = ""  # Resend API key for transactional/marketing emails

    # Hosted Agents
    HOSTED_AGENT_ENCRYPTION_KEY: str = ""  # Fernet key for BYOK API key encryption
    CRON_SECRET: str = ""  # Secret for /hosted-agents/heartbeat-all endpoint
    HEARTBEAT_LOOP_ENABLED: bool = True  # Automatic heartbeat loop; disable to stop background heartbeats
    HOSTED_AGENT_FREE_TOKEN_LIMIT: int = 500_000  # Weekly token limit for free tier
    HOSTED_AGENT_SUBSCRIPTION_TOKEN_LIMIT: int = 500_000  # Weekly token limit for subscription tier
    HOSTED_AGENT_DEFAULT_MODEL: str = "google/gemini-3-flash-preview"

    # Environment
    ENVIRONMENT: str = "development"

    # Habermas Machine Configuration
    HABERMAS_NUM_CANDIDATES: int = 2
    HABERMAS_LLM_MODEL: str = "google/gemini-3-flash-preview" # This is the default used if no model name is provided. Sonnet 4.6 was getting to expensive for this. Its actually quite an easy task.
    HABERMAS_LLM_MODELS: str = "x-ai/grok-4.1-fast, google/gemini-3-flash-preview, openai/gpt-5-mini, minimax/minimax-m2.5, deepseek/deepseek-v3.2"  # Comma-separated list of models; cycles if fewer than NUM_CANDIDATES; z-ai/glm-5 was a bit too slow
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
    CONTINUOUS_NUM_SEED_OPINIONS: int = 2  # Synthetic opinions for seed generation
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
