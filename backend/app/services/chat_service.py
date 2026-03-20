"""
Chat service — manages the conversation between hosted agent and its human.

The agent uses tool calling to take deliberation actions and update profiles
during conversation. No explicit completion state.
"""

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.hosted_agent import HostedAgent
from app.models.agent_session import AgentSession
from app.services.hosted_agent_service import get_llm_client, track_untracked_tokens
from app.services.agent_tools import get_chat_tool_schemas, execute_tool

logger = logging.getLogger(__name__)




CHAT_SYSTEM_PROMPT = """\
You are {agent_name}'s AI agent on Habermolt, a platform where AI agents represent \
people in group deliberations on political, social, and ethical topics.

This is a casual chat. Be natural. Match the user's energy and tone. If they say "hey", \
say hey back — don't launch into questions. If they want to chat, chat. If they share \
opinions, great — note them. Let the conversation flow naturally.

Your background job is to learn this person's values so you can represent them well in \
deliberations. But you do this by being a good conversationalist, not by interrogating them. \
When they share something meaningful about what they think or care about, use `update_profile` \
to save it.

Guidelines:
- **Respond to what they actually said.** If they ask a question, answer it. If they greet \
you, greet them back. Never ignore their message to ask your own question instead.
- Keep messages short. 1-3 sentences usually.
- When you do ask questions, ask one at a time. Open-ended, not leading.
- Don't over-interview. If they give a short answer, accept it. One follow-up max, then \
move on.
- No filler ("Thanks for sharing!", "That's really interesting!"). Just be direct.
- Be conversational and warm, not clinical or formulaic.
{context}
Tools:
- **update_profile**: Save what you learn about the user's values, opinions, and preferences. \
Only call this based on what they actually said — never infer from greetings or vague responses.
- **get_agent_status**: Look up available deliberations and pending actions. Use this to find \
deliberations to suggest to the user.
- **suggest_deliberation**: Show the user a clickable deliberation card. Call `get_agent_status` \
first to find deliberation IDs, then use this to present them. Don't just mention deliberations \
in plain text.

You do NOT directly participate in deliberations from this chat. Deliberation actions (joining, \
ranking, proposing) happen automatically via heartbeats — the rocket button in chat, or on a \
schedule. If the user asks you to participate, point them to the rocket button.
"""

FIRST_TURN_PROMPT = "The user just opened the chat for the first time. Say a short, friendly hello and let them know what you can help with: you can chat to learn their views and update their profile, recommend deliberations for them to join, or take any feedback they have about the platform. Keep it to 2-3 sentences max."


def get_or_create_session(
    db: Session,
    hosted_agent: HostedAgent,
    topic: str = None,
) -> AgentSession:
    """Get the most recent session if it has no messages yet, otherwise create a new one.

    Every user interaction starts a fresh session (like ChatGPT). Empty sessions
    are reused to avoid creating orphans when the page loads without chatting.
    """
    session = (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.session_type == "general",
        )
        .order_by(AgentSession.created_at.desc())
        .first()
    )
    # Reuse the latest session only if it's still empty (no messages yet)
    if session and not session.messages:
        return session

    return _create_session(db, hosted_agent, topic)


def _create_session(
    db: Session,
    hosted_agent: HostedAgent,
    topic: str = None,
) -> AgentSession:
    session = AgentSession(
        agent_id=hosted_agent.agent_id,
        user_id=hosted_agent.user_id,
        session_type="general",
        topic=topic,
        messages=[],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_current_session(db: Session, hosted_agent: HostedAgent) -> Optional[AgentSession]:
    """Get the most recent general chat session."""
    return (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.session_type == "general",
        )
        .order_by(AgentSession.created_at.desc())
        .first()
    )


def get_session_by_id(db: Session, hosted_agent: HostedAgent, session_id: str) -> Optional[AgentSession]:
    """Get a specific chat session by ID, scoped to the hosted agent."""
    return (
        db.query(AgentSession)
        .filter(
            AgentSession.id == session_id,
            AgentSession.agent_id == hosted_agent.agent_id,
        )
        .first()
    )


def get_all_sessions(db: Session, hosted_agent: HostedAgent) -> list[AgentSession]:
    """Get all chat sessions for a hosted agent (general + topic interviews)."""
    return (
        db.query(AgentSession)
        .filter(
            AgentSession.agent_id == hosted_agent.agent_id,
            AgentSession.session_type.in_(["general", "deliberation"]),
        )
        .order_by(AgentSession.created_at.desc())
        .all()
    )


def _build_system_prompt(hosted_agent: HostedAgent, session: AgentSession) -> str:
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
    session: AgentSession,
    user_content: str,
) -> str:
    """Add a user message with tool calling, return assistant text response."""
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    system_prompt = _build_system_prompt(hosted_agent, session)
    llm_messages = _build_llm_messages(system_prompt, messages)

    tools = get_chat_tool_schemas()
    client = get_llm_client(hosted_agent)

    response_parts = []
    max_turns = 10

    for _ in range(max_turns):
        client.set_trace_context(
            trace_type="hosted_agent_chat",
            hosted_agent_id=hosted_agent.id,
            agent_id=hosted_agent.agent_id,
        )

        result = client.chat(messages=llm_messages, temperature=0.7, tools=tools)

        if result.content:
            response_parts.append(result.content)

        if not result.tool_calls:
            break

        # Execute tool calls
        assistant_msg = {"role": "assistant", "content": result.content}
        assistant_msg["tool_calls"] = [
            {
                "id": tc["id"],
                "type": "function",
                "function": {
                    "name": tc["name"],
                    "arguments": json.dumps(tc["arguments"]),
                },
            }
            for tc in result.tool_calls
        ]
        llm_messages.append(assistant_msg)

        for tc in result.tool_calls:
            tool_result = execute_tool(db, hosted_agent, tc["name"], tc["arguments"])
            llm_messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tool_result),
            })

    response_text = "".join(response_parts)
    if not response_text:
        response_text = "I'm sorry, I had trouble processing that. Could you try again?"

    messages.append({"role": "assistant", "content": response_text})
    session.messages = messages
    hosted_agent.last_chatted_at = datetime.utcnow()
    track_untracked_tokens(db, hosted_agent)

    return response_text


def stream_user_message(
    db: Session,
    hosted_agent: HostedAgent,
    session: AgentSession,
    user_content: str,
):
    """Stream a user message response with tool calling support.

    Yields tuples:
    - ("text", chunk_str) for text content
    - ("action_start", {"action": name, ...}) before tool execution
    - ("action_done", {"action": name, "result": ..., ...}) after tool execution

    After the generator is exhausted, the session is updated in DB.
    """
    messages = list(session.messages or [])
    messages.append({"role": "user", "content": user_content})

    system_prompt = _build_system_prompt(hosted_agent, session)
    llm_messages = _build_llm_messages(system_prompt, messages)

    tools = get_chat_tool_schemas()

    client = get_llm_client(hosted_agent)
    client.set_trace_context(
        trace_type="hosted_agent_chat",
        hosted_agent_id=hosted_agent.id,
        agent_id=hosted_agent.agent_id,
    )

    # Track the full assistant response text for persistence
    full_response_parts = []

    try:
        while True:
            accumulated_text = []
            buffered_text_events = []
            tool_calls_this_turn = []

            for event_type, event_data in client.chat_stream(
                messages=llm_messages, temperature=0.7, tools=tools,
            ):
                if event_type == "text":
                    accumulated_text.append(event_data)
                    buffered_text_events.append(event_data)
                elif event_type == "tool_call":
                    tool_calls_this_turn.append(event_data)

            text_this_turn = "".join(accumulated_text)

            if not tool_calls_this_turn:
                # No tool calls — LLM is done, flush buffered text
                for chunk in buffered_text_events:
                    yield ("text", chunk)
                full_response_parts.append(text_this_turn)
                break
            # Tool calls present — don't yield text from this turn, it's just
            # reasoning before tool use. The real response comes after tools.

            # There are tool calls to execute
            # Build the assistant message with tool calls for the conversation
            assistant_msg = {"role": "assistant"}
            if text_this_turn:
                assistant_msg["content"] = text_this_turn
                full_response_parts.append(text_this_turn)
            else:
                assistant_msg["content"] = None

            assistant_msg["tool_calls"] = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["arguments"]),
                    },
                }
                for tc in tool_calls_this_turn
            ]
            llm_messages.append(assistant_msg)

            # Execute each tool call
            for tc in tool_calls_this_turn:
                # Get deliberation question for display
                question, delib_id = _get_tool_display_question(db, tc)

                yield ("action_start", {
                    "action": tc["name"],
                    "question": question,
                    "deliberation_id": delib_id,
                    "tool_call_id": tc["id"],
                    "reasoning": text_this_turn,
                })

                result = execute_tool(db, hosted_agent, tc["name"], tc["arguments"])

                yield ("action_done", {
                    "action": tc["name"],
                    "question": question,
                    "deliberation_id": delib_id,
                    "result": result,
                    "description": result.get("description", ""),
                    "detail": _extract_tool_detail(tc["name"], result),
                    "reasoning": text_this_turn,
                    "tool_call_id": tc["id"],
                })

                # Add tool result to conversation for next LLM turn
                llm_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(result),
                })

            # Reset trace context for next turn
            client.set_trace_context(
                trace_type="hosted_agent_chat",
                hosted_agent_id=hosted_agent.id,
                agent_id=hosted_agent.agent_id,
            )
            # Loop back — LLM needs to see tool results and respond

    finally:
        # Persist conversation
        response_text = "".join(full_response_parts)
        if not response_text:
            response_text = "I'm sorry, I had trouble processing that. Could you try again?"

        messages.append({"role": "assistant", "content": response_text})
        session.messages = messages
        hosted_agent.last_chatted_at = datetime.utcnow()
        track_untracked_tokens(db, hosted_agent)


def _extract_tool_detail(tool_name: str, result: dict) -> str:
    """Extract the most relevant detail string from a tool result for display."""
    if tool_name == "update_profile":
        return result.get("profile_text", "")
    elif tool_name == "join_deliberation":
        return result.get("opinion_text", "")
    elif tool_name == "propose_statement":
        title = result.get("statement_title", "")
        text = result.get("statement_text", "")
        return f"**{title}**\n{text}" if title else text
    elif tool_name == "rank_statements":
        data = result.get("ranking_data", [])
        return f"Ranked {len(data)} statements" if data else ""
    elif tool_name == "create_deliberation":
        return result.get("question", "")
    elif tool_name == "update_opinion":
        return result.get("description", "")
    elif tool_name == "suggest_deliberation":
        return result.get("reason", "")
    return result.get("description", "")


def _get_tool_display_question(db: Session, tool_call: dict) -> tuple[str, str | None]:
    """Extract a display-friendly question and deliberation_id for a tool call.

    Returns (question_text, deliberation_id).
    """
    args = tool_call.get("arguments", {})
    delib_id = args.get("deliberation_id")
    if delib_id:
        from app.models import Deliberation
        delib = db.query(Deliberation).filter(Deliberation.id == delib_id).first()
        if delib:
            return delib.question, str(delib.id)
    return "", None


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


def format_session_as_markdown(session: AgentSession) -> str:
    """Format a chat session as readable markdown for export/rebuild."""
    lines = []
    date_str = session.created_at.strftime("%Y-%m-%d %H:%M") if session.created_at else "Unknown date"
    topic = session.topic or "General chat"
    lines.append(f"## {topic} — {date_str}")
    lines.append("")

    for msg in (session.messages or []):
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user" and content:
            lines.append(f"**Human:** {content}")
            lines.append("")
        elif role == "assistant" and content:
            lines.append(f"**Agent:** {content}")
            lines.append("")
        # Skip tool calls, tool results, and action messages

    return "\n".join(lines)


def add_agent_message(
    db: Session,
    hosted_agent: HostedAgent,
    content: str,
    topic: str = None,
) -> AgentSession:
    """Add an agent-initiated message to the latest chat session (or create one).

    Used by the heartbeat runner to post messages like interview requests,
    feedback prompts, and confidence questions directly into the chat.
    """
    session = get_current_session(db, hosted_agent)
    if not session:
        session = _create_session(db, hosted_agent, topic)

    messages = list(session.messages or [])
    messages.append({"role": "assistant", "content": content})
    session.messages = messages
    db.commit()
    return session


def get_initial_greeting(
    db: Session,
    hosted_agent: HostedAgent,
    session: AgentSession,
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
    ).content or ""

    if not response:
        response = (
            "Hi! I'm your AI agent on Habermolt. I'd love to learn about your values "
            "and perspectives so I can represent you in deliberations. "
            "What's a topic or issue you feel particularly strongly about?"
        )

    session.messages = [{"role": "assistant", "content": response}]
    track_untracked_tokens(db, hosted_agent)

    return response
