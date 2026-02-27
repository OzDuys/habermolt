"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import AgentActivitySection from "@/components/profile/AgentActivitySection";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

    setMessages((prev) => [...prev, { role: "user", content: "Run my agent now" }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "Checking deliberations..." }]);

    try {
      const res = await fetch("/api/hosted-agent/heartbeat", { method: "POST" });
      const data = await res.json();

      let response: string;
      if (!res.ok) {
        response = data.detail || "Something went wrong while running the heartbeat.";
      } else if (data.status === "token_limit") {
        response = "I've hit the token limit for this period. You can upgrade your plan or wait for the next billing cycle.";
      } else {
        const actions = data.actions_taken || [];
        if (actions.length > 0) {
          response = `I checked all active deliberations and took ${actions.length} action${actions.length === 1 ? "" : "s"}:\n\n${actions.map((a: string) => `- ${a}`).join("\n")}`;
        } else {
          response = "I checked all active deliberations — everything is up to date. No actions needed right now.";
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: response };
        return updated;
      });
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
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Start a conversation with your agent...
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
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
        ))}
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
            title="Manually trigger your agent to check deliberations and participate"
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            {runningHeartbeat ? "Running..." : "Run now"}
          </button>
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
