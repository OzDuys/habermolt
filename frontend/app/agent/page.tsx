"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import SessionCarousel from "@/components/agent/SessionCarousel";
import HeartbeatActionViewer from "@/components/agent/HeartbeatActionViewer";
import { type UnifiedSession } from "@/components/agent/SessionCard";
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

interface HeartbeatSessionData {
  id: string;
  action_count: number;
  actions: HeartbeatAction[];
  status: string;
  started_at: string;
  completed_at: string | null;
}

interface HeartbeatAction {
  action: string;
  deliberation_id: string;
  question: string;
  description: string;
  opinion_text?: string;
  ranking_data?: { statement_id: string; rank: number }[];
  statement_title?: string;
  statement_text?: string;
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
  const [unifiedSessions, setUnifiedSessions] = useState<UnifiedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewingHeartbeat, setViewingHeartbeat] = useState<HeartbeatSessionData | null>(null);
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) return;

    fetch("/api/hosted-agent")
      .then((res) => {
        if (res.status === 404) { setHasHostedAgent(false); return; }
        setHasHostedAgent(true);

        // Load current chat + chat history + heartbeat history in parallel
        Promise.all([
          fetch("/api/hosted-agent/chat").then((r) => r.json()),
          fetch("/api/hosted-agent/chat/history").then((r) => r.json()),
          fetch("/api/hosted-agent/heartbeat/history").then((r) => r.json()).catch(() => []),
        ]).then(([chatData, chatHistory, heartbeatHistory]) => {
          if (chatData.messages?.length) {
            setMessages(chatData.messages.map((m: ChatMessage) => ({
              role: m.role,
              content: cleanMessage(m.content),
            })));
          }
          setActiveSessionId(chatData.id || null);

          // Build unified session list
          const chatSessions: UnifiedSession[] = (Array.isArray(chatHistory) ? chatHistory : []).map(
            (s: ChatSessionSummary) => ({
              id: s.id,
              type: "chat" as const,
              topic: s.topic,
              messageCount: s.message_count,
              actionSummary: [],
              createdAt: s.created_at,
              snippet: null,
            })
          );

          const hbSessions: UnifiedSession[] = (Array.isArray(heartbeatHistory) ? heartbeatHistory : []).map(
            (s: HeartbeatSessionData) => ({
              id: `hb-${s.id}`,
              type: "heartbeat" as const,
              topic: null,
              messageCount: 0,
              actionSummary: s.actions.map((a) => a.description),
              createdAt: s.started_at,
              snippet: s.actions[0]?.description || null,
            })
          );

          // Merge and sort by date, oldest first (newest on right)
          const merged = [...chatSessions, ...hbSessions].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setUnifiedSessions(merged);
          setChatReady(true);
        });
      })
      .catch(() => setHasHostedAgent(false));

    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setHasOpenClawAgent(!!data.agent))
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  const loadChatSession = useCallback(async (sessionId: string) => {
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
        setViewingHeartbeat(null);
      }
    } catch {}
  }, [activeSessionId]);

  const loadHeartbeatSession = useCallback(async (hbId: string) => {
    // hbId is prefixed with "hb-"
    const realId = hbId.replace("hb-", "");
    try {
      const res = await fetch(`/api/hosted-agent/heartbeat/${realId}`);
      const data: HeartbeatSessionData = await res.json();
      setViewingHeartbeat(data);
      setActiveSessionId(hbId);
    } catch {}
  }, []);

  const handleSelectSession = useCallback((session: UnifiedSession) => {
    if (session.type === "heartbeat") {
      loadHeartbeatSession(session.id);
    } else {
      loadChatSession(session.id);
    }
  }, [loadChatSession, loadHeartbeatSession]);

  const handleNewChat = useCallback(() => {
    // Reset to fresh state — new messages will create a new session
    setMessages([]);
    setActiveSessionId(null);
    setViewingHeartbeat(null);
  }, []);

  if (isPending) {
    return <LoadingSkeleton />;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mb-6 text-5xl">&#x1F916;</div>
        <h1 className="mb-3 font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
          Your personal AI agent that participates in deliberations on your behalf.
        </p>
        <p className="mb-8 text-sm" style={{ color: "var(--muted)" }}>
          Chat with your agent to teach it your values and preferences, then it will autonomously join deliberations, submit opinions, rank consensus statements, and even propose new ones — all based on what it learns from you.
        </p>
        <a
          href="/sign-in"
          className="inline-block rounded-lg px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Sign in to get started
        </a>
      </div>
    );
  }

  if (hasHostedAgent === null || hasOpenClawAgent === null) {
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
        <>
          <div className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                  Chat
                </h2>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Talk to your agent to help it understand your values.
                </p>
              </div>
              {activeSessionId && (
                <button
                  onClick={handleNewChat}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  + New Chat
                </button>
              )}
            </div>

            {viewingHeartbeat ? (
              <div
                className="flex flex-col rounded-xl border"
                style={{ borderColor: "var(--border)", background: "var(--surface)", height: "28rem" }}
              >
                <div className="flex-1 overflow-y-auto">
                  <HeartbeatActionViewer
                    actions={viewingHeartbeat.actions}
                    startedAt={viewingHeartbeat.started_at}
                  />
                </div>
                <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={handleNewChat}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent)" }}
                  >
                    Start New Conversation
                  </button>
                </div>
              </div>
            ) : (
              <AgentChat messages={messages} setMessages={setMessages} activeSessionId={activeSessionId} />
            )}
          </div>

          {/* Session Timeline Carousel */}
          {unifiedSessions.length > 0 && (
            <div className="mb-8">
              <SessionCarousel
                sessions={unifiedSessions}
                activeSessionId={activeSessionId}
                onSelect={handleSelectSession}
              />
            </div>
          )}
        </>
      )}

      {/* Activity — shown for both hosted and OpenClaw agents */}
      <div>
        <h2 className="mb-4 text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Activity
        </h2>
        <AgentActivitySection />
      </div>
    </div>
  );
}

// --- Custom chat ---

function AgentChat({
  messages,
  setMessages,
  activeSessionId,
}: {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeSessionId: string | null;
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
        body: JSON.stringify({ content: content.trim(), session_id: activeSessionId }),
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
      const chatActions: ActionItem[] = [];
      let hasAssistantMsg = false;

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
              if (!hasAssistantMsg) {
                // Add placeholder assistant message on first chunk
                setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
                hasAssistantMsg = true;
              }
              accumulated += event.content;
              const clean = cleanMessage(accumulated);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: clean };
                return updated;
              });
            } else if (event.type === "action_start") {
              chatActions.push({ type: event.action, deliberation: event.question || "", status: "running" });
              // Insert/update action-group before the assistant text message
              setMessages((prev) => {
                const updated = [...prev];
                // Find or create the action-group
                const lastActionIdx = updated.map((m) => m.role).lastIndexOf("action-group");
                const actionGroupMsg: ChatMessage = { role: "action-group", content: "", actions: [...chatActions] };
                if (lastActionIdx !== -1) {
                  updated[lastActionIdx] = actionGroupMsg;
                } else {
                  // Insert before the last assistant message (or at end)
                  const insertIdx = hasAssistantMsg ? updated.length - 1 : updated.length;
                  updated.splice(insertIdx, 0, actionGroupMsg);
                }
                return updated;
              });
            } else if (event.type === "action_done") {
              const idx = chatActions.findIndex((a) => a.type === event.action && a.status === "running");
              if (idx !== -1) chatActions[idx] = { ...chatActions[idx], status: "done" };
              setMessages((prev) => {
                const updated = [...prev];
                const lastActionIdx = updated.map((m) => m.role).lastIndexOf("action-group");
                if (lastActionIdx !== -1) {
                  updated[lastActionIdx] = { role: "action-group", content: "", actions: [...chatActions] };
                }
                return updated;
              });
            }
          } catch {}
        }
      }

      // If we got actions but no text, add a placeholder
      if (!hasAssistantMsg && chatActions.length > 0) {
        // LLM didn't produce text — that's fine, actions speak for themselves
      } else if (accumulated) {
        const clean = cleanMessage(accumulated);
        setMessages((prev) => {
          const updated = [...prev];
          if (hasAssistantMsg) {
            updated[updated.length - 1] = { role: "assistant", content: clean };
          }
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

    // Add initial loading action-group
    setMessages((prev) => [
      ...prev,
      { role: "action-group", content: "", actions: [{ type: "checking", deliberation: "Checking deliberations...", status: "running" }] },
    ]);

    try {
      const res = await fetch("/api/hosted-agent/heartbeat/stream", { method: "POST" });

      if (!res.ok) {
        const data = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: data.detail || "Something went wrong while running the heartbeat." };
          return updated;
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      const currentActions: ActionItem[] = [];

      // Helper to update the action-group message (last message before any trailing assistant messages)
      const updateActionGroup = (actions: ActionItem[]) => {
        setMessages((prev) => {
          // Find the last action-group message
          const lastActionIdx = prev.map((m) => m.role).lastIndexOf("action-group");
          if (lastActionIdx === -1) return prev;
          const updated = [...prev];
          updated[lastActionIdx] = { role: "action-group", content: "", actions: [...actions] };
          return updated;
        });
      };

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

            if (event.type === "action_start") {
              currentActions.push({ type: event.action, deliberation: event.question, status: "running" });
              // Remove the initial "checking" placeholder on first real action
              const display = currentActions.filter((a) => a.type !== "checking");
              updateActionGroup(display.length > 0 ? display : currentActions);
            } else if (event.type === "action_done") {
              const idx = currentActions.findIndex((a) => a.type === event.action && a.status === "running");
              if (idx !== -1) currentActions[idx] = { ...currentActions[idx], status: "done" };
              updateActionGroup(currentActions.filter((a) => a.type !== "checking"));
            } else if (event.type === "action_error") {
              const idx = currentActions.findIndex((a) => a.type === event.action && a.status === "running");
              if (idx !== -1) currentActions[idx] = { ...currentActions[idx], status: "error" };
              updateActionGroup(currentActions.filter((a) => a.type !== "checking"));
            } else if (event.type === "ask_input") {
              // Show as action card
              currentActions.push({ type: "ask_before_acting", deliberation: event.question, status: "done" });
              updateActionGroup(currentActions.filter((a) => a.type !== "checking"));
              // Also add an assistant chat message so user can reply
              setMessages((prev) => [...prev, { role: "assistant", content: event.message }]);
            } else if (event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: event.message };
                return updated;
              });
            } else if (event.type === "text") {
              // LLM narration/summary text — show as assistant message
              setMessages((prev) => [...prev, { role: "assistant", content: event.content }]);
            } else if (event.type === "done") {
              // Stream complete — if no actions were taken and no text was shown, show "up to date"
              if (currentActions.filter((a) => a.type !== "checking").length === 0) {
                setMessages((prev) => {
                  // Only show default message if no assistant text was added
                  const hasText = prev.some((m) => m.role === "assistant" && m.content && m.content !== "");
                  if (hasText) return prev;
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: "Everything is up to date — no actions needed." };
                  return updated;
                });
              }
            }
          } catch {
            // ignore malformed SSE lines
          }
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
          <div className="flex h-full items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                Chat with your agent
              </p>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                Teach it your values and preferences so it can represent you in deliberations.
                You can also ask it to join deliberations, check its status, rank statements, or run a heartbeat.
              </p>
            </div>
          </div>
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
            &#x2764;&#xFE0F;
          </button>
        </div>
      </div>
    </div>
  );
}

const ACTION_ICONS: Record<string, string> = {
  join_deliberation: "\uD83D\uDCAC",
  rank_statements: "\uD83D\uDDF3\uFE0F",
  add_statement: "\uD83D\uDCDD",
  propose_statement: "\uD83D\uDCDD",
  ask_before_acting: "\uD83D\uDCAC",
  checking: "\uD83D\uDD0D",
  run_heartbeat: "\u2764\uFE0F",
  get_agent_status: "\uD83D\uDCCA",
  update_profile: "\u2705",
  unknown: "\u26A1",
};

const ACTION_LABELS: Record<string, string> = {
  join_deliberation: "Joined deliberation",
  rank_statements: "Ranked statements",
  add_statement: "Proposed consensus",
  propose_statement: "Proposed consensus",
  ask_before_acting: "Needs your input",
  checking: "Checking",
  run_heartbeat: "Running heartbeat",
  get_agent_status: "Checked status",
  update_profile: "Profile updated",
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
              <span className="text-base shrink-0">{ACTION_ICONS[action.type] || "\u26A1"}</span>
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
                  <span className="inline-block animate-spin">&#x23F3;</span>
                ) : action.status === "error" ? (
                  <span style={{ color: "var(--error, red)" }}>&#x2715;</span>
                ) : (
                  <span style={{ color: "var(--accent)" }}>&#x2713;</span>
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
  // Legacy markers — kept for backward compat with old session messages
  const idx = content.indexOf("PROFILE_UPDATE:");
  if (idx !== -1) return content.substring(0, idx).trim();
  const legacyIdx = content.indexOf("INTERVIEW_COMPLETE");
  if (legacyIdx !== -1) return content.substring(0, legacyIdx).trim();
  return content;
}
