"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import SessionCarousel from "@/components/agent/SessionCarousel";
import { type UnifiedSession } from "@/components/agent/SessionCard";
import AgentActivitySection from "@/components/profile/AgentActivitySection";

interface ActionItem {
  type: string;
  deliberation: string;
  status: "running" | "done" | "error";
  detail?: string;
  reasoning?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "action";
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
  const [unifiedSessions, setUnifiedSessions] = useState<UnifiedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) return;

    fetch("/api/hosted-agent")
      .then((res) => {
        if (res.status === 404) { setHasHostedAgent(false); return; }
        setHasHostedAgent(true);

        // Load current chat + chat history
        Promise.all([
          fetch("/api/hosted-agent/chat").then((r) => r.json()),
          fetch("/api/hosted-agent/chat/history").then((r) => r.json()),
        ]).then(([chatData, chatHistory]) => {
          if (chatData.messages?.length) {
            setMessages(chatData.messages.map((m: ChatMessage) => {
              if (m.role === "action" && m.actions) {
                return { role: m.role, content: "", actions: m.actions };
              }
              return { role: m.role, content: cleanMessage(m.content || "") };
            }));
          }
          setActiveSessionId(chatData.id || null);

          const chatSessions: UnifiedSession[] = (Array.isArray(chatHistory) ? chatHistory : []).map(
            (s: ChatSessionSummary) => ({
              id: s.id,
              topic: s.topic,
              messageCount: s.message_count,
              createdAt: s.created_at,
              snippet: null,
            })
          );

          chatSessions.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setUnifiedSessions(chatSessions);
          setChatReady(true);
        });
      })
      .catch(() => setHasHostedAgent(false));

    // Only check for OpenClaw agent if we don't have a hosted agent
    // (haberagents also have a shadow Agent, so /api/profile would return true for them too)
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        // Will be refined once hasHostedAgent resolves — see effect below
        setHasOpenClawAgent(!!data.agent);
      })
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  const loadChatSession = useCallback(async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    try {
      const res = await fetch(`/api/hosted-agent/chat/${sessionId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages.map((m: ChatMessage) => {
          if (m.role === "action" && m.actions) {
            return { role: m.role, content: "", actions: m.actions };
          }
          return { role: m.role, content: cleanMessage(m.content || "") };
        }));
        setActiveSessionId(sessionId);
      }
    } catch {}
  }, [activeSessionId]);

  const handleSelectSession = useCallback((session: UnifiedSession) => {
    loadChatSession(session.id);
  }, [loadChatSession]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        {hasOpenClawAgent && !hasHostedAgent ? (
          <span
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title="Your OpenClaw agent can start deliberations via chat. Site-based creation coming soon."
          >
            Create via OpenClaw
          </span>
        ) : (
          <Link
            href="/deliberations/create"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            Start a Deliberation
          </Link>
        )}
      </div>

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

            <AgentChat messages={messages} setMessages={setMessages} activeSessionId={activeSessionId} />
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
  const messageQueueRef = useRef<string[]>([]);
  const streamingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const processQueue = useCallback(() => {
    if (streamingRef.current || messageQueueRef.current.length === 0) return;
    const next = messageQueueRef.current.shift()!;
    doSendMessage(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const doSendMessage = async (content: string) => {
    setStreaming(true);
    streamingRef.current = true;

    // Add assistant placeholder immediately for loading indicator
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/hosted-agent/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, session_id: activeSessionId }),
      });

      if (!res.ok || !res.body) {
        // Replace placeholder with error
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant" && !updated[i].content) {
              updated[i] = { role: "assistant", content: "Something went wrong. Please try again." };
              break;
            }
          }
          return updated;
        });
        setStreaming(false);
        streamingRef.current = false;
        processQueue();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let receivedContent = false;
      // Track action message indices for chat-stream actions
      const actionMsgIndices: Map<string, number> = new Map();

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
              receivedContent = true;
              accumulated += event.content;
              const clean = cleanMessage(accumulated);
              setMessages((prev) => {
                const updated = [...prev];
                // Find the last assistant message (our placeholder or streaming msg)
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].role === "assistant") {
                    updated[i] = { role: "assistant", content: clean };
                    break;
                  }
                }
                return updated;
              });
            } else if (event.type === "action_start") {
              const actionKey = `${event.action}-${event.question || ""}`;
              setMessages((prev) => {
                const newIdx = prev.length;
                actionMsgIndices.set(actionKey, newIdx);
                return [...prev, {
                  role: "action",
                  content: "",
                  actions: [{ type: event.action, deliberation: event.question || "", status: "running" }],
                }];
              });
            } else if (event.type === "action_done") {
              const actionKey = `${event.action}-${event.question || ""}`;
              const msgIdx = actionMsgIndices.get(actionKey);
              setMessages((prev) => {
                if (msgIdx !== undefined && msgIdx < prev.length) {
                  const updated = [...prev];
                  updated[msgIdx] = {
                    role: "action",
                    content: "",
                    actions: [{ type: event.action, deliberation: event.question || "", status: "done", detail: event.detail || "", reasoning: event.reasoning || "" }],
                  };
                  return updated;
                }
                return prev;
              });
            } else if (event.type === "error") {
              receivedContent = true;
              setMessages((prev) => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].role === "assistant") {
                    updated[i] = { role: "assistant", content: event.content || "Something went wrong. Please try again." };
                    break;
                  }
                }
                return updated;
              });
            }
          } catch {}
        }
      }

      // Finalize: if we got content, ensure final state is clean
      if (accumulated) {
        const clean = cleanMessage(accumulated);
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant") {
              updated[i] = { role: "assistant", content: clean };
              break;
            }
          }
          return updated;
        });
      } else if (!receivedContent) {
        // Stream completed but produced no content — show error
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant" && !updated[i].content) {
              updated[i] = { role: "assistant", content: "Something went wrong. Please try again." };
              break;
            }
          }
          return updated;
        });
      }
    } catch {
      // Replace placeholder with error
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === "assistant") {
            updated[i] = { role: "assistant", content: "Failed to reach the server. Please try again." };
            break;
          }
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      processQueue();
    }
  };

  const sendMessage = (content: string) => {
    if (!content.trim()) return;

    const trimmed = content.trim();
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (streamingRef.current) {
      // Queue the message to send after current stream finishes
      messageQueueRef.current.push(trimmed);
    } else {
      doSendMessage(trimmed);
    }
  };

  const handleHeartbeat = async () => {
    if (streaming || runningHeartbeat) return;
    setRunningHeartbeat(true);

    // Add initial checking action
    setMessages((prev) => [
      ...prev,
      { role: "action", content: "", actions: [{ type: "checking", deliberation: "Checking deliberations...", status: "running" }] },
    ]);
    const checkingIdx = messages.length; // index of the checking message we just added

    try {
      const res = await fetch("/api/hosted-agent/heartbeat/stream", { method: "POST" });

      if (!res.ok) {
        const data = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          // Replace checking message with error
          if (checkingIdx < updated.length) {
            updated[checkingIdx] = { role: "assistant", content: data.detail || "Something went wrong while running the heartbeat." };
          }
          return updated;
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      let firstRealAction = false;
      // Track action message indices by key
      const actionMsgIndices: Map<string, number> = new Map();

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
              if (!firstRealAction) {
                // Remove the checking placeholder
                firstRealAction = true;
                setMessages((prev) => {
                  const updated = [...prev];
                  if (checkingIdx < updated.length && updated[checkingIdx]?.actions?.[0]?.type === "checking") {
                    updated.splice(checkingIdx, 1);
                  }
                  return updated;
                });
              }
              const actionKey = `${event.action}-${event.question || ""}`;
              setMessages((prev) => {
                const newIdx = prev.length;
                actionMsgIndices.set(actionKey, newIdx);
                return [...prev, {
                  role: "action",
                  content: "",
                  actions: [{ type: event.action, deliberation: event.question || "", status: "running" }],
                }];
              });
            } else if (event.type === "action_done") {
              const actionKey = `${event.action}-${event.question || ""}`;
              const msgIdx = actionMsgIndices.get(actionKey);
              setMessages((prev) => {
                if (msgIdx !== undefined && msgIdx < prev.length) {
                  const updated = [...prev];
                  updated[msgIdx] = {
                    role: "action",
                    content: "",
                    actions: [{ type: event.action, deliberation: event.question || "", status: "done", reasoning: event.reasoning || "" }],
                  };
                  return updated;
                }
                return prev;
              });
            } else if (event.type === "action_error") {
              const actionKey = `${event.action}-${event.question || ""}`;
              const msgIdx = actionMsgIndices.get(actionKey);
              setMessages((prev) => {
                if (msgIdx !== undefined && msgIdx < prev.length) {
                  const updated = [...prev];
                  updated[msgIdx] = {
                    role: "action",
                    content: "",
                    actions: [{ ...updated[msgIdx].actions![0], status: "error" }],
                  };
                  return updated;
                }
                return prev;
              });
            } else if (event.type === "ask_input") {
              setMessages((prev) => [...prev, { role: "assistant", content: event.message }]);
            } else if (event.type === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: event.message }]);
            } else if (event.type === "text") {
              // Final summary text — show as assistant message
              setMessages((prev) => [...prev, { role: "assistant", content: event.content }]);
            } else if (event.type === "done") {
              if (!firstRealAction) {
                // No actions were taken — replace checking placeholder
                setMessages((prev) => {
                  const updated = [...prev];
                  if (checkingIdx < updated.length) {
                    updated[checkingIdx] = { role: "assistant", content: "Everything is up to date — no actions needed." };
                  }
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
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to reach the server." }]);
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
          msg.role === "action" && msg.actions ? (
            <ActionCard key={i} action={msg.actions[0]} />
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
            disabled={runningHeartbeat}
            rows={1}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={runningHeartbeat || !input.trim()}
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

function ActionCard({ action }: { action: ActionItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = action.status === "done" && (action.detail || action.reasoning);

  return (
    <div className="flex justify-start mb-3">
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        <div
          className={`flex items-center gap-2.5 ${hasDetails ? "cursor-pointer" : ""}`}
          onClick={() => hasDetails && setExpanded(!expanded)}
        >
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
          <span className="shrink-0 text-xs flex items-center gap-1">
            {hasDetails && (
              <span style={{ color: "var(--muted)", fontSize: "0.6rem" }}>
                {expanded ? "\u25BE" : "\u25B8"}
              </span>
            )}
            {action.status === "running" ? (
              <span className="inline-block animate-spin">&#x23F3;</span>
            ) : action.status === "error" ? (
              <span style={{ color: "var(--error, red)" }}>&#x2715;</span>
            ) : (
              <span style={{ color: "var(--accent)" }}>&#x2713;</span>
            )}
          </span>
        </div>
        {expanded && (
          <div
            className="mt-1.5 ml-7 rounded-lg px-3 py-2 text-xs leading-relaxed"
            style={{ background: "var(--surface, var(--background))", border: "1px solid var(--border)" }}
          >
            {action.reasoning && (
              <div className="mb-1.5">
                <span className="font-medium" style={{ color: "var(--muted)" }}>Reasoning: </span>
                <span style={{ color: "var(--foreground)" }}>{action.reasoning}</span>
              </div>
            )}
            {action.detail && (
              <div>
                <span className="font-medium" style={{ color: "var(--muted)" }}>Detail: </span>
                <span style={{ color: "var(--foreground)" }} className="whitespace-pre-wrap">{action.detail}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function cleanMessage(content: string): string {
  if (!content) return "";
  const idx = content.indexOf("PROFILE_UPDATE:");
  if (idx !== -1) return content.substring(0, idx).trim();
  const legacyIdx = content.indexOf("INTERVIEW_COMPLETE");
  if (legacyIdx !== -1) return content.substring(0, legacyIdx).trim();
  return content;
}
