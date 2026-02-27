"""
Interview service — manages the chat loop between hosted agent and its human.

Adapted from Anthropic's interviewer methodology: the interviewer is a host and student,
nearly invisible, probing for specifics, one question per message, conversational and natural.
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.hosted_agent import HostedAgent
from app.models.interview_session import HostedAgentInterviewSession
from app.services.hosted_agent_service import get_llm_client

logger = logging.getLogger(__name__)

INTERVIEW_SYSTEM_PROMPT = """\
You are conducting an interview on behalf of Habermolt, a democratic deliberation platform \
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
{deliberation_context}
Interview plan (adapt as the conversation flows):
1. Briefly introduce yourself and the purpose — you're building a picture of their values so an \
AI agent can represent them in democratic deliberations. There are no right or wrong answers.
2. Ask what topic or issue they feel most strongly about, and why.
3. Dig into the underlying value or principle — what sits beneath their position?
4. Move to a different dimension — explore a contrasting area (e.g., if they talked about \
economics, ask about social issues, or vice versa).
5. Ask a broader values question — what matters most to them when thinking about how society \
should work?
6. Surface a tension — if you've noticed a tradeoff in their views, name it and ask how they \
think about it.
7. Put it all together — reflect back what you've heard in 2-3 sentences and ask if it resonates \
or if you've missed anything.
8. Close — thank them and let them know they can do another interview anytime their views change.

Completion:
When you have enough information (typically after 6-8 exchanges) and have reflected your \
understanding back to the participant, end your FINAL message with EXACTLY this format \
(the participant will not see anything after INTERVIEW_COMPLETE):

INTERVIEW_COMPLETE
USER_PROFILE:
Write a concise markdown profile that captures everything you learned. Use whatever structure \
makes sense for this person. Include their core values, key opinions, how they approach tradeoffs, \
and anything else an AI agent would need to represent them faithfully across a wide range of topics. \
Be specific — vague summaries are useless. Write it as if you're briefing another agent who will \
act on this person's behalf.
"""

REINTERVIEW_SYSTEM_PROMPT = """\
You are conducting a focused follow-up interview on behalf of Habermolt, a democratic \
deliberation platform. You already have a profile of this person's values (below), but a \
new deliberation topic has come up that you can't confidently represent them on.

Your job: ask 2-3 targeted questions about this specific topic so you can update their profile. \
Be direct — explain what deliberation prompted this and why you need their input.

## Current Profile
{profile}

## Topic Needing Input
{topic}

Rules:
- Ask ONE question per message.
- Be conversational but focused. 2-3 exchanges should be enough.
- Probe vague answers — you need specifics to represent them well.
- Do not use evaluative language. Stay neutral.

Completion:
When done, end your message with:

INTERVIEW_COMPLETE
PROFILE_UPDATE:
Write a short markdown section covering what you learned about their views on this topic. \
This will be appended to their existing profile.
"""

FIRST_TURN_PROMPT = "You are now connected with the participant. Start the interview."


def get_or_create_session(
    db: Session,
    hosted_agent: HostedAgent,
    topic: str = None,
) -> HostedAgentInterviewSession:
    """Get the current active session or create a new one."""
    session = (
        db.query(HostedAgentInterviewSession)
        .filter(
            HostedAgentInterviewSession.hosted_agent_id == hosted_agent.id,
            HostedAgentInterviewSession.is_complete == False,
        )
        .order_by(HostedAgentInterviewSession.created_at.desc())
        .first()
    )
    if session:
        return session

    session = HostedAgentInterviewSession(
        hosted_agent_id=hosted_agent.id,
        topic=topic,
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_current_session(db: Session, hosted_agent: HostedAgent) -> Optional[HostedAgentInterviewSession]:
    """Get the most recent session (complete or not)."""
    return (
        db.query(HostedAgentInterviewSession)
        .filter(HostedAgentInterviewSession.hosted_agent_id == hosted_agent.id)
        .order_by(HostedAgentInterviewSession.created_at.desc())
        .first()
    )


def get_all_sessions(db: Session, hosted_agent: HostedAgent) -> list[HostedAgentInterviewSession]:
    """Get all interview sessions for a hosted agent."""
    return (
        db.query(HostedAgentInterviewSession)
        .filter(HostedAgentInterviewSession.hosted_agent_id == hosted_agent.id)
        .order_by(HostedAgentInterviewSession.created_at.desc())
        .all()
    )


def start_fresh_session(db: Session, hosted_agent: HostedAgent, topic: str = None) -> HostedAgentInterviewSession:
    """Mark any incomplete sessions as complete and start a new one."""
    db.query(HostedAgentInterviewSession).filter(
        HostedAgentInterviewSession.hosted_agent_id == hosted_agent.id,
        HostedAgentInterviewSession.is_complete == False,
    ).update({"is_complete": True, "completed_at": datetime.utcnow()})
    db.commit()

    session = HostedAgentInterviewSession(
        hosted_agent_id=hosted_agent.id,
        topic=topic,
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _build_system_prompt(hosted_agent: HostedAgent, interview_session: HostedAgentInterviewSession) -> str:
    """Build the appropriate system prompt for this session."""
    if interview_session.topic and hosted_agent.user_profile:
        return REINTERVIEW_SYSTEM_PROMPT.format(
            profile=hosted_agent.user_profile,
            topic=interview_session.topic,
        )

    # Check if topic contains deliberation context for grounded onboarding
    deliberation_context = ""
    if interview_session.topic and not hosted_agent.user_profile:
        deliberation_context = f"""
The participant chose these deliberation topics as ones they care about:
{interview_session.topic}

Ground your early questions around these topics to keep the conversation concrete and relevant, \
then broaden to explore their deeper values and principles.
"""

    return INTERVIEW_SYSTEM_PROMPT.format(deliberation_context=deliberation_context)


def _build_llm_messages(system_prompt: str, conversation: list[dict]) -> list[dict]:
    """Build the full message list for the LLM call including conversation history."""
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation)
    return messages


def add_user_message(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentInterviewSession,
    user_content: str,
) -> str:
    """Add a user message, call LLM with full conversation history, return assistant response."""
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    system_prompt = _build_system_prompt(hosted_agent, session)
    llm_messages = _build_llm_messages(system_prompt, messages)

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_interview",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    response_text = client.chat(
        messages=llm_messages,
        temperature=0.7,
    )

    if not response_text:
        response_text = "I'm sorry, I had trouble processing that. Could you try again?"

    messages.append({"role": "assistant", "content": response_text})

    if "INTERVIEW_COMPLETE" in response_text:
        _handle_completion(db, hosted_agent, session, response_text)

    session.messages = messages
    db.commit()

    return response_text


def _handle_completion(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentInterviewSession,
    response_text: str,
) -> None:
    """Extract profile from completion response and store it."""
    session.is_complete = True
    session.completed_at = datetime.utcnow()

    try:
        if "USER_PROFILE:" in response_text:
            profile_text = _extract_text_after_marker(response_text, "USER_PROFILE:")
            if profile_text:
                hosted_agent.user_profile = profile_text
                hosted_agent.profile_version += 1
                hosted_agent.last_interviewed_at = datetime.utcnow()
                logger.info(f"Stored user profile for hosted agent {hosted_agent.id}")

        elif "PROFILE_UPDATE:" in response_text:
            update_text = _extract_text_after_marker(response_text, "PROFILE_UPDATE:")
            if update_text:
                existing = hosted_agent.user_profile or ""
                hosted_agent.user_profile = existing.rstrip() + "\n\n" + update_text
                hosted_agent.profile_version += 1
                hosted_agent.last_interviewed_at = datetime.utcnow()
                logger.info(f"Updated user profile for hosted agent {hosted_agent.id}")

    except Exception as e:
        logger.warning(f"Failed to parse interview profile: {e}")


def _extract_text_after_marker(text: str, marker: str) -> Optional[str]:
    """Extract text after a marker, stripping code fences if present."""
    idx = text.find(marker)
    if idx == -1:
        return None
    after = text[idx + len(marker):].strip()
    if after.startswith("```"):
        first_newline = after.find("\n")
        if first_newline != -1:
            after = after[first_newline + 1:]
        end = after.rfind("```")
        if end != -1:
            after = after[:end]
    return after.strip() or None


def get_initial_greeting(
    db: Session,
    hosted_agent: HostedAgent,
    session: HostedAgentInterviewSession,
) -> str:
    """Generate the first message from the interviewer and store it in the session."""
    system_prompt = _build_system_prompt(hosted_agent, session)

    llm_messages = _build_llm_messages(system_prompt, [
        {"role": "user", "content": FIRST_TURN_PROMPT},
    ])

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_interview",
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
