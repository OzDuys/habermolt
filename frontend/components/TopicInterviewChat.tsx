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

interface SetupProgress {
  current_step: string;
  completed_steps: string[];
  error: string | null;
}

interface TopicInterviewChatProps {
  deliberationId: string;
  sessionId: string;
  greeting: string;
  initialMessages?: Message[];
  initialStatus?: string;
  initialSetupProgress?: SetupProgress | null;
  onComplete?: () => void;
}

const SETUP_STEPS = [
  { key: "opinion_submitted", label: "Opinion submitted" },
  { key: "seed_statements", label: "Generating consensus statements" },
  { key: "ranking", label: "Ranking statements" },
  { key: "proposing", label: "Proposing consensus" },
  { key: "completed", label: "Done" },
];

export default function TopicInterviewChat({
  deliberationId,
  sessionId,
  greeting,
  initialMessages,
  initialStatus,
  initialSetupProgress,
  onComplete,
}: TopicInterviewChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [{ role: "assistant", content: greeting }]
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [interviewStatus, setInterviewStatus] = useState<string>(initialStatus || "active");
  const [currentActions, setCurrentActions] = useState<ActionEvent[]>([]);
  const [setupProgress, setSetupProgress] = useState<SetupProgress | null>(initialSetupProgress || null);
  const [retrying, setRetrying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentActions, setupProgress]);

  useEffect(() => {
    if (!sending && interviewStatus === "active") inputRef.current?.focus();
  }, [sending, interviewStatus]);

  // Poll for setup progress when in setup_running state
  useEffect(() => {
    if (interviewStatus !== "setup_running") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/topic-interview/${sessionId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        setSetupProgress(data.setup_progress);
        if (data.status === "completed") {
          setInterviewStatus("completed");
          onComplete?.();
        }
      } catch {
        // ignore
      }
    };

    // Poll immediately, then every 2s
    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [interviewStatus, sessionId, onComplete]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/topic-interview/${sessionId}/retry-setup`, { method: "POST" });
      if (res.ok) {
        setSetupProgress((prev) => prev ? { ...prev, error: null } : prev);
        // Polling will pick up the new status
      }
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

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
              // Set initial progress immediately so UI has something before first poll
              if (event.status === "setup_running") {
                setSetupProgress((prev) => prev || {
                  current_step: "seed_statements",
                  completed_steps: ["opinion_submitted"],
                  error: null,
                });
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
  const isSetupRunning = interviewStatus === "setup_running";
  const chatDisabled = isCompleted || isSetupRunning;

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

        {/* Action indicators (from SSE stream) */}
        {currentActions.length > 0 && (
          <div className="space-y-2 pl-2">
            {currentActions.map((action, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--surface-dim)" }}
              >
                <span style={action.status === "running" ? { animation: "pulse 1.5s ease-in-out infinite" } : {}}>{action.status === "running" ? "⏳" : action.status === "done" ? "✓" : "✗"}</span>
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

        {/* Setup progress (from polling) */}
        {isSetupRunning && setupProgress && (
          <div className="space-y-2 pl-2">
            <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Setting up your deliberation...
            </div>
            {SETUP_STEPS.map((step) => {
              const completed = setupProgress.completed_steps?.includes(step.key);
              const isCurrent = setupProgress.current_step === step.key && !completed;
              const isFuture = !completed && !isCurrent;
              return (
                <div
                  key={step.key}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: isFuture ? "transparent" : "var(--border)",
                    background: completed ? "var(--surface-dim)" : isCurrent ? "var(--surface-dim)" : "transparent",
                  }}
                >
                  <span style={isCurrent ? { animation: "pulse 1.5s ease-in-out infinite" } : {}}>
                    {completed ? "✓" : isCurrent ? "⏳" : "○"}
                  </span>
                  <span style={{ color: isFuture ? "var(--muted)" : "var(--foreground)" }}>{step.label}</span>
                </div>
              );
            })}
            {setupProgress.error && (
              <div className="space-y-2">
                <div
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{ borderColor: "var(--error, #dc2626)", color: "var(--error, #dc2626)" }}
                >
                  Setup failed: {setupProgress.error}
                </div>
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {retrying ? "Retrying..." : "Retry"}
                </button>
              </div>
            )}
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
      {!chatDisabled && (
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
      {/* Pulse animation for setup progress */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
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
