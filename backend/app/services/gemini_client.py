"""Gemini API client for statement generation."""

import logging

import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_SAFETY_SETTINGS = (
    {
        "category": "HARM_CATEGORY_HARASSMENT",
        "threshold": "BLOCK_ONLY_HIGH",
    },
    {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "threshold": "BLOCK_ONLY_HIGH",
    },
    {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "threshold": "BLOCK_ONLY_HIGH",
    },
    {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "threshold": "BLOCK_ONLY_HIGH",
    },
)


class GeminiClient:
    """Thin wrapper around Google's generativeai SDK for statement generation."""

    def __init__(self, model_name: str = None, api_key: str = None):
        self._api_key = api_key or settings.GOOGLE_API_KEY
        self._model_name = model_name or settings.HABERMAS_LLM_MODEL
        genai.configure(api_key=self._api_key)
        self._model = genai.GenerativeModel(
            model_name=self._model_name,
            safety_settings=DEFAULT_SAFETY_SETTINGS,
        )

    def sample_text(
        self,
        prompt: str,
        temperature: float = 0.8,
        max_tokens: int = 8192,
        stop_sequences: list[str] = None,
    ) -> str:
        """Generate text from Gemini. Returns raw response string."""
        sample = self._model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                stop_sequences=stop_sequences or [],
            ),
            safety_settings=DEFAULT_SAFETY_SETTINGS,
            stream=False,
        )
        try:
            response = sample.candidates[0].content.parts[0].text
        except (ValueError, IndexError) as e:
            logger.error(f"Gemini API error: {e}")
            if hasattr(sample, "prompt_feedback"):
                logger.error(f"Safety ratings: {sample.prompt_feedback}")
            response = ""

        # Truncate at stop sequence (same behavior as HM's truncate util)
        if stop_sequences:
            for seq in stop_sequences:
                if seq in response:
                    response = response.split(seq, 1)[0] + seq

        return response
