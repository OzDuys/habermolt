"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import AgentActivitySection from "@/components/profile/AgentActivitySection";

interface ActionItem {
  type: string;
  deliberation: string;
  status: "running" | "done" | "error";
}

interface ChatMessage {
  role: "user" | "assistant" | "action-group";
  content: string;
  actions?: ActionItem[];
}

interface ChatSessionSummary {
  id: string;
  topic: string | null;
  message_count: number;
  created_at: string;
}

export default function AgentPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AgentPageContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-64 rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    </div>
  );
}

function AgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [hasHostedAgent, setHasHostedAgent] = useState<boolean | null>(null);
  const [hasOpenClawAgent, setHasOpenClawAgent] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) { router.push("/sign-in"); return; }

    fetch("/api/hosted-agent")
      .then((res) => {
        if (res.status === 404) { setHasHostedAgent(false); return; }
        setHasHostedAgent(true);

        // Load current chat + history in parallel
        Promise.all([
          fetch("/api/hosted-agent/chat").then((r) => r.json()),
          fetch("/api/hosted-agent/chat/history").then((r) => r.json()),
        ]).then(([chatData, historyData]) => {
          if (chatData.messages?.length) {
            setMessages(chatData.messages.map((m: ChatMessage) => ({
              role: m.role,
              content: cleanMessage(m.content),
            })));
          }
          setActiveSessionId(chatData.id || null);
          if (Array.isArray(historyData)) setChatSessions(historyData);
          setChatReady(true);
        });
      })
      .catch(() => setHasHostedAgent(false));

    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setHasOpenClawAgent(!!data.agent))
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  const loadSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    try {
      const res = await fetch(`/api/hosted-agent/chat/${sessionId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages.map((m: ChatMessage) => ({
          role: m.role,
          content: cleanMessage(m.content),
        })));
        setActiveSessionId(sessionId);
      }
    } catch {}
  }, [activeSessionId]);

  if (isPending || hasHostedAgent === null || hasOpenClawAgent === null) {
    return <LoadingSkeleton />;
  }

  if (!hasHostedAgent && !hasOpenClawAgent) {
    router.push("/profile");
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <h1 className="mb-6 font-serif text-3xl" style={{ color: "var(--foreground)" }}>
        My Agent
      </h1>

      {hasHostedAgent && chatReady && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            Chat
          </h2>
          <p className="mb-4 text-xs" style={{ color: "var(--muted)" }}>
            Talk to your agent to help it understand your values. It will update your profile as it learns.
          </p>

          {chatSessions.length > 0 && (
            <ChatSessionList
              sessions={chatSessions}
              activeSessionId={activeSessionId}
              onSelect={loadSession}
            />
          )}

          <AgentChat messages={messages} setMessages={setMessages} />
        </div>
      )}

      <div>
        <h2 className="mb-4 text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Activity
        </h2>
        <AgentActivitySection />
      </div>
    </div>
  );
}

// --- Chat session list ---

function ChatSessionList({
  sessions,
  activeSessionId,
  onSelect,
}: {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-opacity hover:opacity-80"
          style={{
            borderColor: s.id === activeSessionId ? "var(--accent)" : "var(--border)",
            background: s.id === activeSessionId ? "var(--accent)" : "var(--surface)",
            color: s.id === activeSessionId ? "white" : "var(--foreground)",
          }}
        >
          {s.topic
            ? s.topic.length > 40 ? s.topic.slice(0, 40) + "..." : s.topic
            : new Date(s.created_at).toLocaleDateString()}
          {" "}({s.message_count})
        </button>
      ))}
    </div>
  );
}

// --- Custom chat ---

function AgentChat({
  messages,
  setMessages,
}: {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [runningHeartbeat, setRunningHeartbeat] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/hosted-agent/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "chunk") {
              accumulated += event.content;
              const clean = cleanMessage(accumulated);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: clean };
                return updated;
              });
            }
          } catch {}
        }
      }

      // Final clean
      if (accumulated) {
        const clean = cleanMessage(accumulated);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: clean };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to reach the server." }]);
    } finally {
      setStreaming(false);
    }
  };

  const handleHeartbeat = async () => {
    if (streaming || runningHeartbeat) return;
    setRunningHeartbeat(true);

    // Add a loading action-group message
    setMessages((prev) => [
      ...prev,
      { role: "action-group", content: "", actions: [{ type: "checking", deliberation: "Checking deliberations...", status: "running" }] },
    ]);

    try {
      const res = await fetch("/api/hosted-agent/heartbeat", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: data.detail || "Something went wrong while running the heartbeat." };
          return updated;
        });
      } else if (data.status === "token_limit") {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: "Token limit reached for this period." };
          return updated;
        });
      } else {
        const actionStrings: string[] = data.actions_taken || [];
        if (actionStrings.length > 0) {
          const parsedActions: ActionItem[] = actionStrings.map((a: string) => parseActionString(a));
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "action-group", content: "", actions: parsedActions };
            return updated;
          });
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: "Everything is up to date — no actions needed." };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Failed to reach the server." };
        return updated;
      });
    } finally {
      setRunningHeartbeat(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const busy = streaming || runningHeartbeat;

  return (
    <div
      className="flex flex-col rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)", height: "28rem" }}
    >
      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center" />
        )}
        {messages.map((msg, i) =>
          msg.role === "action-group" && msg.actions ? (
            <ActionGroup key={i} actions={msg.actions} />
          ) : (
            <div key={i} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user" ? "rounded-br-md text-white" : "rounded-bl-md"
                }`}
                style={
                  msg.role === "user"
                    ? { background: "var(--accent)" }
                    : { background: "var(--background)", border: "1px solid var(--border)" }
                }
              >
                {msg.content || (
                  <span className="inline-block animate-pulse" style={{ color: "var(--muted)" }}>...</span>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {/* Composer */}
      <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={busy}
            rows={1}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={busy || !input.trim()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Send
          </button>
          <button
            onClick={handleHeartbeat}
            disabled={busy}
            title="Run heartbeat — check deliberations and participate"
            className={`rounded-lg border px-3 py-2 text-lg transition-opacity hover:opacity-80 disabled:opacity-50 ${runningHeartbeat ? "animate-pulse" : ""}`}
            style={{ borderColor: "var(--border)" }}
          >
            ❤️
          </button>
        </div>
      </div>
    </div>
  );
}

function parseActionString(action: string): ActionItem {
  if (action.startsWith("Joined '")) {
    return { type: "join_deliberation", deliberation: action.slice(8, -1), status: "done" };
  }
  if (action.startsWith("Ranked statements on '")) {
    return { type: "rank_statements", deliberation: action.slice(22, -1), status: "done" };
  }
  if (action.startsWith("Proposed consensus on '")) {
    return { type: "add_statement", deliberation: action.slice(22, -1), status: "done" };
  }
  return { type: "unknown", deliberation: action, status: "done" };
}

const ACTION_ICONS: Record<string, string> = {
  join_deliberation: "💬",
  rank_statements: "🗳️",
  add_statement: "📝",
  checking: "🔍",
  unknown: "⚡",
};

const ACTION_LABELS: Record<string, string> = {
  join_deliberation: "Joined deliberation",
  rank_statements: "Ranked statements",
  add_statement: "Proposed consensus",
  checking: "Checking",
  unknown: "Action",
};

function ActionGroup({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="flex justify-start mb-3">
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 text-sm"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="text-base shrink-0">{ACTION_ICONS[action.type] || "⚡"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  {ACTION_LABELS[action.type] || action.type}
                </span>
                {action.deliberation && action.type !== "checking" && (
                  <p className="text-xs truncate" style={{ color: "var(--foreground)" }}>
                    {action.deliberation}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs">
                {action.status === "running" ? (
                  <span className="inline-block animate-spin">⏳</span>
                ) : action.status === "error" ? (
                  <span style={{ color: "var(--error, red)" }}>✕</span>
                ) : (
                  <span style={{ color: "var(--accent)" }}>✓</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cleanMessage(content: string): string {
  const idx = content.indexOf("PROFILE_UPDATE:");
  if (idx !== -1) return content.substring(0, idx).trim();
  const legacyIdx = content.indexOf("INTERVIEW_COMPLETE");
  if (legacyIdx !== -1) return content.substring(0, legacyIdx).trim();
  return content;
}
