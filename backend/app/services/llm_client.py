"""LLM client for statement generation via OpenAI-compatible APIs.

Supports any OpenAI-compatible provider (OpenRouter, OpenAI, local models, etc.)
by configuring LLM_BASE_URL and LLM_API_KEY in .env.

Automatically logs all calls to llm_traces table for monitoring.
"""

import logging
import time
from typing import Optional
from uuid import UUID

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Thin wrapper around the OpenAI SDK for statement generation.

    Works with any OpenAI-compatible API by changing base_url.
    Automatically logs all calls to llm_traces table for monitoring.
    """

    def __init__(self, model_name: str = None, api_key: str = None, base_url: str = None):
        self._model_name = model_name or settings.HABERMAS_LLM_MODEL
        self._client = OpenAI(
            api_key=api_key or settings.LLM_API_KEY,
            base_url=base_url or settings.LLM_BASE_URL,
        )
        # Trace context — set via set_trace_context() before calling sample_text()
        self._trace_type: Optional[str] = None
        self._trace_deliberation_id: Optional[UUID] = None
        self._trace_agent_id: Optional[UUID] = None

    def set_trace_context(
        self,
        trace_type: str,
        deliberation_id: UUID = None,
        agent_id: UUID = None,
    ):
        """Set trace context for the next sample_text call."""
        self._trace_type = trace_type
        self._trace_deliberation_id = deliberation_id
        self._trace_agent_id = agent_id

    def _clear_trace_context(self):
        self._trace_type = None
        self._trace_deliberation_id = None
        self._trace_agent_id = None

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

        start_time = time.time()

        try:
            response = self._client.chat.completions.create(**kwargs)
            latency_ms = int((time.time() - start_time) * 1000)
            output_text = response.choices[0].message.content or ""

            # Extract token counts if available
            usage = getattr(response, 'usage', None)
            tokens_in = usage.prompt_tokens if usage else None
            tokens_out = usage.completion_tokens if usage else None

            self._log_trace(
                messages=messages,
                output_text=output_text,
                temperature=temperature,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                status="success",
            )

            self._clear_trace_context()
            return output_text
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            self._log_trace(
                messages=messages,
                temperature=temperature,
                latency_ms=latency_ms,
                status="error",
                error_message=str(e),
            )
            self._clear_trace_context()
            logger.error(f"LLM API error: {e}")
            return ""

    def _extract_provider(self) -> str:
        base_url = settings.LLM_BASE_URL.lower()
        if "openrouter" in base_url:
            return "openrouter"
        elif "api.openai.com" in base_url:
            return "openai"
        elif "localhost" in base_url or "127.0.0.1" in base_url:
            return "local"
        return "custom"

    def _log_trace(
        self,
        messages: list,
        temperature: float = None,
        output_text: str = None,
        tokens_in: int = None,
        tokens_out: int = None,
        latency_ms: int = None,
        status: str = "success",
        error_message: str = None,
    ):
        """Log trace to database. Never crashes the caller."""
        try:
            from app.models.llm_trace import LLMTrace
            from app.database import SessionLocal

            db = SessionLocal()
            try:
                trace = LLMTrace(
                    trace_type=self._trace_type or "unknown",
                    status=status,
                    model=self._model_name,
                    provider=self._extract_provider(),
                    temperature=temperature,
                    input_messages=messages,
                    output_text=output_text,
                    tokens_in=tokens_in,
                    tokens_out=tokens_out,
                    latency_ms=latency_ms,
                    error_message=error_message,
                    deliberation_id=self._trace_deliberation_id,
                    agent_id=self._trace_agent_id,
                )
                db.add(trace)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to log LLM trace: {e}")


# Backward-compatible alias
GeminiClient = LLMClient
