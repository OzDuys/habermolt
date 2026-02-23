"""
Embedding service for deliberation similarity checking.

Uses the OpenAI-compatible embeddings API (via OpenRouter by default)
to produce 1536-dim vectors for deliberation questions, enabling
cosine-similarity lookups via pgvector before a deliberation is created.
"""

import logging
import time

from openai import OpenAI
from app.config import settings

logger = logging.getLogger(__name__)


def _log_embedding_trace(
    model: str,
    input_text: str,
    tokens_in: int = None,
    latency_ms: int = None,
    status: str = "success",
    error_message: str = None,
):
    """Log embedding API call to traces table."""
    try:
        from app.models.llm_trace import LLMTrace
        from app.database import SessionLocal

        db = SessionLocal()
        try:
            trace = LLMTrace(
                trace_type="embedding",
                status=status,
                model=model,
                provider="openrouter" if "openrouter" in settings.LLM_BASE_URL.lower() else "openai",
                input_messages=[{"role": "user", "content": input_text[:500]}],
                tokens_in=tokens_in,
                latency_ms=latency_ms,
                error_message=error_message,
            )
            db.add(trace)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to log embedding trace: {e}")


def get_statement_embeddings(texts: list[str]) -> list[list[float]] | None:
    """
    Return 1536-dim embeddings for a batch of statement texts in one API call,
    or None on failure.
    """
    if not texts:
        return []
    start_time = time.time()
    try:
        client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )
        response = client.embeddings.create(
            input=texts,
            model=settings.EMBEDDING_MODEL,
        )
        latency_ms = int((time.time() - start_time) * 1000)
        ordered = sorted(response.data, key=lambda d: d.index)

        tokens_in = response.usage.prompt_tokens if hasattr(response, 'usage') and response.usage else None
        _log_embedding_trace(
            model=settings.EMBEDDING_MODEL,
            input_text=f"[batch of {len(texts)} statements]",
            tokens_in=tokens_in,
            latency_ms=latency_ms,
        )

        return [item.embedding for item in ordered]
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        _log_embedding_trace(
            model=settings.EMBEDDING_MODEL,
            input_text=f"[batch of {len(texts)} statements]",
            latency_ms=latency_ms,
            status="error",
            error_message=str(e),
        )
        logger.warning(f"Could not generate batch embeddings: {e}")
        return None


def get_question_embedding(question: str) -> list[float] | None:
    """
    Return a 1536-dim embedding for the given question string, or None on failure.
    """
    start_time = time.time()
    try:
        client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )
        response = client.embeddings.create(
            input=question,
            model=settings.EMBEDDING_MODEL,
        )
        latency_ms = int((time.time() - start_time) * 1000)
        embedding = response.data[0].embedding

        tokens_in = response.usage.prompt_tokens if hasattr(response, 'usage') and response.usage else None
        _log_embedding_trace(
            model=settings.EMBEDDING_MODEL,
            input_text=question,
            tokens_in=tokens_in,
            latency_ms=latency_ms,
        )

        logger.info(f"Got question embedding: {len(embedding)} dims")
        return embedding
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        _log_embedding_trace(
            model=settings.EMBEDDING_MODEL,
            input_text=question,
            latency_ms=latency_ms,
            status="error",
            error_message=str(e),
        )
        logger.error(f"Could not generate question embedding: {e}")
        return None
