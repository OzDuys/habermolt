"""
Chat service — manages the conversation between hosted agent and its human.

The agent proactively decides when to update the user's profile based on
what it learns during conversation. No explicit completion state.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.hosted_agent import HostedAgent
from app.models.interview_session import HostedAgentChatSession
from app.services.hosted_agent_service import get_llm_client

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = """\
You are {agent_name}'s AI agent on Habermolt, a democratic deliberation platform \
where AI agents represent real people in group discussions on political, social, and ethical topics.

Your goal: understand this person's values, opinions, and priorities well enough that an AI \
agent can faithfully represent them in deliberations they can't attend.

You play the dual role of host and student. Put the participant at ease. The more comfortable \
they feel, the more honest and detailed their answers will be. Once they're talking, get out \
of the way. Think of them as the world's foremost expert on themselves. Insert yourself only \
to redirect, clarify, or probe deeper.

Rules:
- Ask ONE question per message. Never ask multiple questions at once.
- Keep an ear out for vague answers. You want details and specifics. Probe with "Tell me more \
about that" or "What specifically makes you feel that way?" Don't move on until you have \
something concrete.
- Do not ask leading or yes-or-no questions. Use open-ended questions.
- Maintain neutrality. Do not use evaluative language like "great point" or "I appreciate that." \
Just acknowledge briefly and continue.
- Use the active voice. Be concise and direct.
- Be conversational and natural, not clinical or formulaic.
- If the person volunteers information without you asking, that's ideal — go deeper on it.
- Do not patronize the participant.
{context}
Profile updates:
When you learn enough new information to meaningfully update or refine the user's profile, \
append a PROFILE_UPDATE section at the very end of your message. The user will NOT see this \
section — it will be extracted and stored automatically. Format:

PROFILE_UPDATE:
Write a concise markdown profile section capturing what you've learned. Be specific — vague \
summaries are useless. Write it as if you're briefing another agent who will act on this \
person's behalf.

You can output PROFILE_UPDATE at any point in the conversation — whenever you feel you have \
enough new information to meaningfully update their profile. You don't need to wait for a \
specific moment. Do it naturally as the conversation progresses.
"""

FIRST_TURN_PROMPT = "You are now connected with the participant. Start the conversation."


SESSION_GAP = timedelta(hours=1)


def get_or_create_session(
    db: Session,
    hosted_agent: HostedAgent,
    topic: str = None,
) -> HostedAgentChatSession:
    """Get the most recent session, or create a new one if stale (>1h since last chat)."""
    session = (
        db.query(HostedAgentChatSession)
        .filter(HostedAgentChatSession.hosted_agent_id == hosted_agent.id)
        .order_by(HostedAgentChatSession.created_at.desc())
        .first()
    )
    if session:
        # Start a new session if the last interaction was over SESSION_GAP ago
        last_active = hosted_agent.last_chatted_at or session.created_at
        if session.messages and datetime.utcnow() - last_active > SESSION_GAP:
            return _create_session(db, hosted_agent, topic)
        return session

    return _create_session(db, hosted_agent, topic)


def _create_session(
    db: Session,
    hosted_agent: HostedAgent,
    topic: str = None,
) -> HostedAgentChatSession:
    session = HostedAgentChatSession(
        hosted_agent_id=hosted_agent.id,
        topic=topic,
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_current_session(db: Session, hosted_agent: HostedAgent) -> Optional[HostedAgentChatSession]:
    """Get the most recent session."""
    return (
        db.query(HostedAgentChatSession)
        .filter(HostedAgentChatSession.hosted_agent_id == hosted_agent.id)
        .order_by(HostedAgentChatSession.created_at.desc())
        .first()
    )


def get_session_by_id(db: Session, hosted_agent: HostedAgent, session_id: str) -> Optional[HostedAgentChatSession]:
    """Get a specific chat session by ID, scoped to the hosted agent."""
    return (
        db.query(HostedAgentChatSession)
        .filter(
            HostedAgentChatSession.id == session_id,
            HostedAgentChatSession.hosted_agent_id == hosted_agent.id,
        )
        .first()
    )


def get_all_sessions(db: Session, hosted_agent: HostedAgent) -> list[HostedAgentChatSession]:
    """Get all chat sessions for a hosted agent."""
    return (
        db.query(HostedAgentChatSession)
        .filter(HostedAgentChatSession.hosted_agent_id == hosted_agent.id)
        .order_by(HostedAgentChatSession.created_at.desc())
        .all()
    )


def _build_system_prompt(hosted_agent: HostedAgent, session: HostedAgentChatSession) -> str:
    """Build the system prompt with context."""
    context_parts = []

    if hosted_agent.user_profile:
        context_parts.append(f"""
## Current Profile
You already have a profile for this person. Use it as context but keep exploring \
and updating as you learn new things.

{hosted_agent.user_profile}
""")

    if session.topic:
        context_parts.append(f"""
## Topic Context
The participant is interested in these topics:
{session.topic}

Ground your questions around these topics to keep the conversation concrete and relevant, \
then broaden to explore their deeper values and principles.
""")

    context = "\n".join(context_parts) if context_parts else ""
    return CHAT_SYSTEM_PROMPT.format(
        agent_name=hosted_agent.display_name,
        context=context,
    )


def _build_llm_messages(system_prompt: str, conversation: list[dict]) -> list[dict]:
    """Build the full message list for the LLM call including conversation history."""
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation)
    return messages


def add_user_message(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentChatSession,
    user_content: str,
) -> str:
    """Add a user message, call LLM with full conversation history, return assistant response."""
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    system_prompt = _build_system_prompt(hosted_agent, session)
    llm_messages = _build_llm_messages(system_prompt, messages)

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_chat",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    response_text = client.chat(
        messages=llm_messages,
        temperature=0.7,
    )

    if not response_text:
        response_text = "I'm sorry, I had trouble processing that. Could you try again?"

    # Extract and apply profile updates if present
    clean_response = response_text
    if "PROFILE_UPDATE:" in response_text:
        clean_response, profile_text = _extract_profile_update(response_text)
        if profile_text:
            if hosted_agent.user_profile:
                hosted_agent.user_profile = hosted_agent.user_profile.rstrip() + "\n\n" + profile_text
            else:
                hosted_agent.user_profile = profile_text
            hosted_agent.profile_version += 1
            hosted_agent.last_chatted_at = datetime.utcnow()
            logger.info(f"Updated user profile for hosted agent {hosted_agent.id}")

    # Store the full response (with marker) in messages for LLM context continuity
    messages.append({"role": "assistant", "content": response_text})
    session.messages = messages
    hosted_agent.last_chatted_at = datetime.utcnow()
    db.commit()

    # Return the clean response (without PROFILE_UPDATE) for display
    return clean_response


def stream_user_message(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentChatSession,
    user_content: str,
):
    """Stream a user message response. Yields text chunks.

    After the generator is exhausted, the session and profile are updated in DB.
    """
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    system_prompt = _build_system_prompt(hosted_agent, session)
    llm_messages = _build_llm_messages(system_prompt, messages)

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_chat",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    accumulated = []
    try:
        for chunk in client.chat_stream(messages=llm_messages, temperature=0.7):
            accumulated.append(chunk)
            yield chunk
    finally:
        # Always persist, even if the stream is interrupted or generator closed early
        response_text = "".join(accumulated)
        if not response_text:
            response_text = "I'm sorry, I had trouble processing that. Could you try again?"

        # Extract and apply profile updates if present
        if "PROFILE_UPDATE:" in response_text:
            _, profile_text = _extract_profile_update(response_text)
            if profile_text:
                if hosted_agent.user_profile:
                    hosted_agent.user_profile = hosted_agent.user_profile.rstrip() + "\n\n" + profile_text
                else:
                    hosted_agent.user_profile = profile_text
                hosted_agent.profile_version += 1
                logger.info(f"Updated user profile for hosted agent {hosted_agent.id}")

        # Store the full response in messages for LLM context continuity
        messages.append({"role": "assistant", "content": response_text})
        session.messages = messages
        hosted_agent.last_chatted_at = datetime.utcnow()
        db.commit()


def _extract_profile_update(text: str) -> tuple[str, Optional[str]]:
    """Extract PROFILE_UPDATE section from response. Returns (clean_text, profile_text)."""
    idx = text.find("PROFILE_UPDATE:")
    if idx == -1:
        return text, None

    clean_text = text[:idx].strip()
    after = text[idx + len("PROFILE_UPDATE:"):].strip()

    # Strip code fences if present
    if after.startswith("```"):
        first_newline = after.find("\n")
        if first_newline != -1:
            after = after[first_newline + 1:]
        end = after.rfind("```")
        if end != -1:
            after = after[:end]

    profile_text = after.strip() or None
    return clean_text, profile_text


def get_initial_greeting(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentChatSession,
) -> str:
    """Generate the first message from the agent and store it in the session."""
    system_prompt = _build_system_prompt(hosted_agent, session)

    llm_messages = _build_llm_messages(system_prompt, [
        {"role": "user", "content": FIRST_TURN_PROMPT},
    ])

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_chat",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    response = client.chat(
        messages=llm_messages,
        temperature=0.7,
    )

    if not response:
        response = (
            "Hi! I'm your AI agent on Habermolt. I'd love to learn about your values "
            "and perspectives so I can represent you in deliberations. "
            "What's a topic or issue you feel particularly strongly about?"
        )

    session.messages = [{"role": "assistant", "content": response}]
    db.commit()

    return response
