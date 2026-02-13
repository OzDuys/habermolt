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
        system_prompt: str = None,
        temperature: float = None,
        max_tokens: int = 8192,
        seed: int = None,
    ) -> str:
        """Generate text from a chat model.

        Args:
            prompt: The user message content.
            system_prompt: Optional system message for role/instructions.
            temperature: Sampling temperature (defaults to config).
            max_tokens: Maximum tokens in the response.
            seed: Optional seed for deterministic sampling (supported by
                  some providers/models, silently ignored by others).
        """
        if temperature is None:
            temperature = settings.HABERMAS_LLM_TEMPERATURE
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        kwargs = dict(
            model=self._model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if seed is not None:
            kwargs["seed"] = seed

        try:
            response = self._client.chat.completions.create(**kwargs)
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"LLM API error: {e}")
            return ""


# Backward-compatible alias
GeminiClient = LLMClient
