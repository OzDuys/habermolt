"""LLM client for statement generation via OpenAI-compatible APIs.

Supports any OpenAI-compatible provider (OpenRouter, OpenAI, local models, etc.)
by configuring LLM_BASE_URL and LLM_API_KEY in .env.

Automatically logs all calls (including cost) to llm_traces table for monitoring.
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

from openai import OpenAI

from app.config import settings


def sanitize_llm_text(text: str) -> str:
    """Strip control characters from LLM output to prevent storage corruption.

    Preserves newlines, tabs, and carriage returns. Removes all other
    C0/C1 control characters (U+0000-U+001F except \\t\\n\\r, and U+007F-U+009F).
    """
    if not text:
        return text
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)


def sanitize_prompt_text(text: str) -> str:
    """Sanitize user-generated text before embedding it in an LLM prompt.

    Prevents cross-agent prompt injection by:
    1. Escaping XML tag delimiters so injected </opinion> or </statement> tags
       cannot break out of their XML-tag sandbox.
    2. Stripping C0/C1 control characters (same as sanitize_llm_text).

    This must be applied to ALL agent-submitted content (opinions, statements,
    questions) before it is interpolated into prompts sent to the LLM.
    """
    if not text:
        return text
    # Strip control characters first
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
    # Escape XML angle brackets so user text cannot close/open XML tags
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    return text

logger = logging.getLogger(__name__)

# Fallback pricing per 1M tokens (USD): (input, output)
# Used when the provider doesn't return cost directly.
MODEL_PRICING_FALLBACK: dict[str, tuple[float, float]] = {
    "x-ai/grok-4.3":                       (0.20, 0.50),
    "google/gemini-3-flash-preview":        (0.50, 3.00),
    "google/gemini-3.1-flash-lite-preview": (0.25, 1.50),
    "deepseek/deepseek-v3.2":              (0.26, 0.38),
    "minimax/minimax-m2.5":                (0.20, 1.17),
    "z-ai/glm-5":                          (0.72, 2.30),
    "arcee-ai/trinity-large-preview:free":  (0.00, 0.00),
    "openai/text-embedding-3-small":       (0.02, 0.00),
}
DEFAULT_PRICING = (0.50, 1.50)  # fallback for unknown models


@dataclass
class ChatResult:
    """Result from a chat() call that may include tool calls."""
    content: Optional[str] = None
    tool_calls: Optional[list[dict]] = None


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
        self._trace_hosted_agent_id: Optional[UUID] = None

    def set_trace_context(
        self,
        trace_type: str,
        deliberation_id: UUID = None,
        agent_id: UUID = None,
        hosted_agent_id: UUID = None,
    ):
        """Set trace context for the next sample_text call."""
        self._trace_type = trace_type
        self._trace_deliberation_id = deliberation_id
        self._trace_agent_id = agent_id
        self._trace_hosted_agent_id = hosted_agent_id

    def _clear_trace_context(self):
        self._trace_type = None
        self._trace_deliberation_id = None
        self._trace_agent_id = None
        self._trace_hosted_agent_id = None

    def sample_text(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: float = None,
        max_tokens: int = 8192,
        seed: int = None,
        disable_reasoning: bool = False,
    ) -> str:
        """Generate text from a chat model.

        Args:
            prompt: The user message content.
            system_prompt: Optional system message for role/instructions.
            temperature: Sampling temperature (defaults to config).
            max_tokens: Maximum tokens in the response.
            seed: Optional seed for deterministic sampling (supported by
                  some providers/models, silently ignored by others).
            disable_reasoning: If True, ask the provider to skip chain-of-thought
                  reasoning. Use for short, deterministic classification/extraction
                  tasks (PASS/FAIL, category slugs, a single digit). On reasoning
                  models the hidden reasoning tokens count against max_tokens, so a
                  small budget can be fully consumed by reasoning, yielding an empty
                  completion. Disabling reasoning makes a small budget safe (and is
                  cheaper + faster). Ignored by providers/models without reasoning.
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
        if disable_reasoning:
            # OpenRouter unified reasoning control — maps to per-provider thinking
            # toggles (e.g. Gemini thinkingBudget=0). Silently ignored otherwise.
            kwargs["extra_body"] = {"reasoning": {"enabled": False}}

        start_time = time.time()

        try:
            response = self._client.chat.completions.create(**kwargs)
            latency_ms = int((time.time() - start_time) * 1000)
            output_text = sanitize_llm_text(response.choices[0].message.content or "")

            # Extract token counts if available
            usage = getattr(response, 'usage', None)
            tokens_in = usage.prompt_tokens if usage else None
            tokens_out = usage.completion_tokens if usage else None

            # Extract cost — OpenRouter returns it in the usage object
            cost_total = self._extract_cost(usage, tokens_in, tokens_out)

            self._log_trace(
                messages=messages,
                output_text=output_text,
                temperature=temperature,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                status="success",
                cost_total=cost_total,
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

    def chat(
        self,
        messages: list[dict],
        temperature: float = None,
        max_tokens: int = 8192,
        tools: list[dict] = None,
    ) -> ChatResult:
        """Generate text from a full message history (system + user/assistant turns).

        When tools is None, returns ChatResult(content=text) for backward compatibility.
        When tools is provided, may return ChatResult with tool_calls.
        """
        if temperature is None:
            temperature = settings.HABERMAS_LLM_TEMPERATURE

        kwargs = dict(
            model=self._model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if tools:
            kwargs["tools"] = tools

        start_time = time.time()

        try:
            response = self._client.chat.completions.create(**kwargs)
            latency_ms = int((time.time() - start_time) * 1000)
            message = response.choices[0].message
            output_text = sanitize_llm_text(message.content or "")

            usage = getattr(response, 'usage', None)
            tokens_in = usage.prompt_tokens if usage else None
            tokens_out = usage.completion_tokens if usage else None
            cost_total = self._extract_cost(usage, tokens_in, tokens_out)

            self._log_trace(
                messages=messages,
                output_text=output_text,
                temperature=temperature,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                status="success",
                cost_total=cost_total,
            )

            self._clear_trace_context()

            # Check for tool calls
            raw_tool_calls = getattr(message, 'tool_calls', None)
            if raw_tool_calls:
                parsed_calls = []
                for tc in raw_tool_calls:
                    try:
                        args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                    except json.JSONDecodeError:
                        args = {}
                    parsed_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": args,
                    })
                return ChatResult(content=message.content, tool_calls=parsed_calls)

            return ChatResult(content=output_text)
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
            return ChatResult(content="")

    def chat_stream(
        self,
        messages: list[dict],
        temperature: float = None,
        max_tokens: int = 8192,
        tools: list[dict] = None,
    ):
        """Stream text from a full message history. Yields events as they arrive.

        When tools is None: yields ("text", chunk_str) tuples for backward compat.
        When tools is provided: yields ("text", str) for text content and
        ("tool_call", {"id": ..., "name": ..., "arguments": ...}) for completed tool calls.
        """
        if temperature is None:
            temperature = settings.HABERMAS_LLM_TEMPERATURE

        kwargs = dict(
            model=self._model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        if tools:
            kwargs["tools"] = tools

        start_time = time.time()
        accumulated = []
        usage_data = None
        # Accumulate tool calls across streaming chunks
        tool_call_accumulators: dict[int, dict] = {}  # index -> {id, name, arguments_parts}

        try:
            stream = self._client.chat.completions.create(**kwargs)
            for chunk in stream:
                if not chunk.choices:
                    if hasattr(chunk, 'usage') and chunk.usage:
                        usage_data = chunk.usage
                    continue

                delta = chunk.choices[0].delta

                # Text content
                if delta.content:
                    clean = sanitize_llm_text(delta.content)
                    if clean:
                        accumulated.append(clean)
                        yield ("text", clean)

                # Tool calls (arrive incrementally across chunks)
                if hasattr(delta, 'tool_calls') and delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_call_accumulators:
                            tool_call_accumulators[idx] = {
                                "id": "",
                                "name": "",
                                "arguments_parts": [],
                            }
                        acc = tool_call_accumulators[idx]
                        if tc_delta.id:
                            acc["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                acc["name"] = tc_delta.function.name
                            if tc_delta.function.arguments:
                                acc["arguments_parts"].append(tc_delta.function.arguments)

                # Final chunk often has usage
                if hasattr(chunk, 'usage') and chunk.usage:
                    usage_data = chunk.usage

            # Yield completed tool calls
            for idx in sorted(tool_call_accumulators.keys()):
                acc = tool_call_accumulators[idx]
                args_str = "".join(acc["arguments_parts"])
                try:
                    args = json.loads(args_str) if args_str else {}
                except json.JSONDecodeError:
                    args = {}
                yield ("tool_call", {
                    "id": acc["id"],
                    "name": acc["name"],
                    "arguments": args,
                })

            latency_ms = int((time.time() - start_time) * 1000)
            output_text = "".join(accumulated)
            tokens_in = usage_data.prompt_tokens if usage_data else None
            tokens_out = usage_data.completion_tokens if usage_data else None
            cost_total = self._extract_cost(usage_data, tokens_in, tokens_out)

            self._log_trace(
                messages=messages,
                output_text=output_text,
                temperature=temperature,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                status="success",
                cost_total=cost_total,
            )
            self._clear_trace_context()

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
            logger.error(f"LLM streaming error: {e}")
            return

    def _extract_cost(self, usage, tokens_in: int = None, tokens_out: int = None) -> Optional[float]:
        """Extract cost from OpenRouter response, or estimate from pricing table."""
        if usage is not None:
            # OpenRouter includes cost in the usage object (non-standard field)
            cost = getattr(usage, 'cost', None)
            if cost is not None:
                try:
                    return float(cost)
                except (TypeError, ValueError):
                    pass
            # Also check model_extra for pydantic v2 SDK
            extra = getattr(usage, 'model_extra', None) or {}
            if 'cost' in extra:
                try:
                    return float(extra['cost'])
                except (TypeError, ValueError):
                    pass

        # Fallback: estimate from token counts and pricing table
        if tokens_in is not None and tokens_out is not None:
            return self._estimate_cost(self._model_name, tokens_in, tokens_out)
        return None

    @staticmethod
    def _estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
        """Estimate cost from token counts using the pricing table."""
        pricing = MODEL_PRICING_FALLBACK.get(model, DEFAULT_PRICING)
        return (tokens_in * pricing[0] / 1_000_000) + (tokens_out * pricing[1] / 1_000_000)

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
        cost_total: float = None,
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
                    cost_total=cost_total,
                    error_message=error_message,
                    deliberation_id=self._trace_deliberation_id,
                    agent_id=self._trace_agent_id,
                    hosted_agent_id=self._trace_hosted_agent_id,
                )
                db.add(trace)
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to log LLM trace: {e}")


# Backward-compatible alias
GeminiClient = LLMClient
