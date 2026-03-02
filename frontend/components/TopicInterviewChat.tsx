"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ActionEvent {
  action: string;
  question?: string;
  description?: string;
  detail?: string;
  status?: "running" | "done" | "error";
}

interface TopicInterviewChatProps {
  deliberationId: string;
  sessionId: string;
  greeting: string;
  onComplete?: () => void;
}

export default function TopicInterviewChat({
  deliberationId,
  sessionId,
  greeting,
  onComplete,
}: TopicInterviewChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [interviewStatus, setInterviewStatus] = useState<string>("active");
  const [currentActions, setCurrentActions] = useState<ActionEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentActions]);

  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setCurrentActions([]);

    try {
      const res = await fetch(`/api/topic-interview/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${err.detail || "Something went wrong."}` },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "chunk") {
              assistantText += event.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && prev.length > 1 && last.content !== greeting) {
                  return [...prev.slice(0, -1), { role: "assistant", content: assistantText }];
                }
                return [...prev, { role: "assistant", content: assistantText }];
              });
            } else if (event.type === "action_start") {
              setCurrentActions((prev) => [
                ...prev,
                { action: event.action, question: event.question, status: "running" },
              ]);
            } else if (event.type === "action_done") {
              setCurrentActions((prev) =>
                prev.map((a) =>
                  a.action === event.action && a.status === "running"
                    ? { ...a, status: "done", description: event.description, detail: event.detail }
                    : a
                )
              );
            } else if (event.type === "status") {
              setInterviewStatus(event.status);
              if (event.status === "completed") {
                onComplete?.();
              }
            } else if (event.type === "error") {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${event.content}` },
              ]);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, sessionId, greeting, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isCompleted = interviewStatus === "completed";

  return (
    <div className="flex flex-col rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "28rem" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "rounded-br-none text-white"
                  : "rounded-bl-none border"
              }`}
              style={
                msg.role === "user"
                  ? { background: "var(--accent)" }
                  : { borderColor: "var(--border)", background: "var(--surface-dim)", color: "var(--foreground)" }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && currentActions.length === 0 && (
          <div className="flex justify-start">
            <div
              className="flex items-center gap-1.5 rounded-lg rounded-bl-none border px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--surface-dim)" }}
            >
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "0ms" }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "150ms" }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Action indicators */}
        {currentActions.length > 0 && (
          <div className="space-y-2 pl-2">
            {currentActions.map((action, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-dim)" }}
              >
                <span>{action.status === "running" ? "\u23F3" : action.status === "done" ? "\u2713" : "\u2717"}</span>
                <span style={{ color: "var(--foreground)" }}>
                  {_actionLabel(action.action)}
                </span>
                {action.description && (
                  <span style={{ color: "var(--muted)" }}> — {action.description}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Completion banner */}
        {isCompleted && (
          <div
            className="rounded-lg border p-3 text-center text-sm"
            style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
          >
            Interview complete! Your agent is now participating in this deliberation.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!isCompleted && (
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share your views..."
              rows={1}
              disabled={sending}
              className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-50"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface-dim)",
                color: "var(--foreground)",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function _actionLabel(action: string): string {
  switch (action) {
    case "submit_opinion":
      return "Submitting opinion";
    case "update_profile":
      return "Updating profile";
    case "rank_statements":
      return "Ranking statements";
    case "propose_statement":
      return "Proposing consensus";
    default:
      return action;
  }
}
