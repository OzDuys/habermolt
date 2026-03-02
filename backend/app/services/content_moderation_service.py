"""Content moderation service — checks deliberation questions against community guidelines.

Uses an LLM to evaluate whether a proposed deliberation question is appropriate
for the Habermolt platform before it is published.

The guidelines checked are:
  1. Good faith deliberation (no manipulation or gaming intent)
  2. Substantive enough for meaningful deliberation
  3. No hate speech or discrimination
  4. No harassment of private individuals (public figures in news context are fair game)
  5. No calls for violence
  6. Grounded in reality (no misinformation-anchored framing)
  7. No spam or commercial promotion
  8. Respects privacy of real individuals
  9. Protects research integrity (no coordination/flooding attempts)
  10. Democratic spirit (genuine deliberative potential)

Called synchronously during deliberation creation so violations can be rejected
before any DB writes occur.
"""

import logging

from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a content moderator for Habermolt, an academic AI deliberation research platform.
Your task is to determine whether a proposed deliberation question meets the platform's community guidelines.

Community guidelines — reject if the question:
1. Is posed in bad faith to manipulate or game deliberation outcomes
2. Is too trivial or lacks genuine deliberative potential
3. Contains hate speech or discriminates against protected groups
4. Directly harasses or incites violence against a private individual (questions about public figures, politicians, executives, and organisations in the context of their public roles or news events are ALLOWED — even provocative or edgy framing is fine)
5. Promotes, encourages, or celebrates violence
6. Is built on demonstrably false premises or misinformation
7. Is commercial spam, self-promotion, or a near-identical duplicate framing
8. Reveals or solicits private information about real individuals
9. Attempts to corrupt research integrity (e.g. coordinated flooding)
10. Has no genuine deliberative potential and is purely inflammatory

Good questions can be controversial, politically sensitive, provocative, or uncomfortable —
that is fine. Edgy, spicy, or memeable questions are welcome as long as they invite genuine debate.
The bar is legitimacy, not comfort. Err on the side of PASS.

Reply with exactly one of:
  PASS
  FAIL: <brief reason (max 15 words)>

Nothing else."""

_USER_TEMPLATE = 'Deliberation question: "{question}"'


def check_community_guidelines(question: str) -> tuple[bool, str]:
    """Check whether a deliberation question meets community guidelines.

    Args:
        question: The proposed deliberation question.

    Returns:
        (passes, reason) where passes=True means the question is acceptable.
        If passes=False, reason contains a brief explanation.
    """
    client = LLMClient()
    client.set_trace_context(trace_type="content_moderation")

    try:
        raw = client.sample_text(
            prompt=_USER_TEMPLATE.format(question=question),
            system_prompt=_SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=64,
        ).strip()
    except Exception as exc:
        # If the moderation call fails, fail open (allow the question through)
        # so a transient LLM error doesn't block all deliberation creation.
        logger.warning(f"[moderation] LLM call failed, failing open: {exc}")
        return True, ""

    if not raw:
        logger.warning("[moderation] Empty response from LLM, failing open")
        return True, ""

    upper = raw.upper()
    if upper.startswith("PASS"):
        return True, ""

    if upper.startswith("FAIL"):
        # Extract reason after "FAIL:" if present
        parts = raw.split(":", 1)
        reason = parts[1].strip() if len(parts) > 1 else ""
        logger.info(f"[moderation] Question rejected: {reason!r} — {question[:100]!r}")
        return False, reason

    # Unexpected response format — fail open
    logger.warning(f"[moderation] Unexpected LLM response: {raw!r}, failing open")
    return True, ""
