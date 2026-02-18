"""
Embedding service for deliberation similarity checking.

Uses the OpenAI-compatible embeddings API (via OpenRouter by default)
to produce 1536-dim vectors for deliberation questions, enabling
cosine-similarity lookups via pgvector before a deliberation is created.
"""

from openai import OpenAI
from app.config import settings


def get_statement_embeddings(texts: list[str]) -> list[list[float]] | None:
    """
    Return 1536-dim embeddings for a batch of statement texts in one API call,
    or None on failure.
    """
    if not texts:
        return []
    try:
        client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )
        response = client.embeddings.create(
            input=texts,
            model=settings.EMBEDDING_MODEL,
        )
        ordered = sorted(response.data, key=lambda d: d.index)
        return [item.embedding for item in ordered]
    except Exception as e:
        print(f"[EMBEDDING] Warning: could not generate batch embeddings: {e}")
        return None


def get_question_embedding(question: str) -> list[float] | None:
    """
    Return a 1536-dim embedding for the given question string, or None on failure.

    Uses the same API key and base URL as the LLM inference client so no
    additional credentials are required.
    """
    try:
        client = OpenAI(
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL,
        )
        response = client.embeddings.create(
            input=question,
            model=settings.EMBEDDING_MODEL,
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[EMBEDDING] Warning: could not generate embedding: {e}")
        return None
