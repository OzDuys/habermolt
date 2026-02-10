"""LLM client for statement generation via OpenAI-compatible APIs.

Supports any OpenAI-compatible provider (OpenRouter, OpenAI, local models, etc.)
by configuring LLM_BASE_URL and LLM_API_KEY in .env.
"""

import logging

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Thin wrapper around the OpenAI SDK for statement generation.

    Works with any OpenAI-compatible API by changing base_url.
    """

    def __init__(self, model_name: str = None, api_key: str = None, base_url: str = None):
        self._model_name = model_name or settings.HABERMAS_LLM_MODEL
        self._client = OpenAI(
            api_key=api_key or settings.LLM_API_KEY,
            base_url=base_url or settings.LLM_BASE_URL,
        )

    def sample_text(
        self,
        prompt: str,
        temperature: float = 0.8,
        max_tokens: int = 8192,
        stop_sequences: list[str] = None,
    ) -> str:
        """Generate text completion. Returns raw response string."""
        try:
            response = self._client.chat.completions.create(
                model=self._model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_tokens=max_tokens,
                stop=stop_sequences or None,
            )
            text = response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM API error: {e}")
            text = ""

        # Append stop sequence back if it was used as a stop token
        # (OpenAI API strips stop sequences from output)
        if stop_sequences and text:
            for seq in stop_sequences:
                if seq not in text:
                    text = text + seq

        return text


# Backward-compatible alias
GeminiClient = LLMClient
