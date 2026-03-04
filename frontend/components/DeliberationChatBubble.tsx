"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant" | "action";
  content?: string;
  action?: string;
  status?: string;
  description?: string;
  detail?: string;
}

interface ActionEvent {
  action: string;
  status: "running" | "done" | "error";
  description?: string;
  detail?: string;
}

interface SetupProgress {
  current_step: string;
  completed_steps: string[];
  error: string | null;
}

export interface DeliberationChatBubbleHandle {
  triggerJoin: () => void;
}

interface DeliberationChatBubbleProps {
  deliberationId: string;
  deliberationQuestion: string;
  alreadyParticipating: boolean;
  onJoinComplete?: () => void;
  onScrollToAgents?: () => void;
}

const SETUP_STEPS = [
  { key: "opinion_submitted", label: "Opinion submitted" },
  { key: "seed_statements", label: "Generating consensus statements" },
  { key: "ranking", label: "Ranking statements" },
  { key: "proposing", label: "Proposing consensus" },
  { key: "completed", label: "Done" },
];

function actionLabel(action: string): string {
  switch (action) {
    case "submit_opinion": return "Opinion submitted";
    case "update_opinion": return "Opinion updated";
    case "update_profile": return "Profile updated";
    case "rerank_statements": return "Statements reranked";
    case "rank_statements": return "Statements ranked";
    case "seed_statements": return "Statements generated";
    case "propose_statement": return "Consensus proposed";
    default: return action;
  }
}

type Phase = "browsing" | "setup" | "participating";

const DeliberationChatBubble = forwardRef<DeliberationChatBubbleHandle, DeliberationChatBubbleProps>(
  function DeliberationChatBubble({ deliberationId, deliberationQuestion, alreadyParticipating, onJoinComplete, onScrollToAgents }, ref) {
    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>(alreadyParticipating ? "participating" : "browsing");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentActions, setCurrentActions] = useState<ActionEvent[]>([]);
    const [setupProgress, setSetupProgress] = useState<SetupProgress | null>(null);
    const [retrying, setRetrying] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pendingJoinRef = useRef(false);

    // Expose triggerJoin to parent
    useImperativeHandle(ref, () => ({
      triggerJoin: () => {
        if (phase === "participating" || phase === "setup") return;
        if (!open) {
          pendingJoinRef.current = true;
          setOpen(true);
        } else if (sessionId) {
          sendMessageText("I'd like to join this deliberation and share my views.", sessionId);
        }
      },
    }));

    // Initialize session when opened
    useEffect(() => {
      if (!open || sessionId) return;

      setLoading(true);
      fetch("/api/backend/deliberation-chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliberation_id: deliberationId }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Failed to start chat");
          const data = await res.json();
          setSessionId(data.session_id);
          setPhase(data.phase || "browsing");

          // Restore message history
          if (data.history && data.history.length > 0) {
            setMessages(data.history.map((m: Record<string, string>) => {
              if (m.role === "action") {
                return { role: "action" as const, action: m.action, status: m.status, description: m.description, detail: m.detail };
              }
              return { role: m.role as "user" | "assistant", content: m.content };
            }));
          } else {
            setMessages([{ role: "assistant", content: data.greeting }]);
          }

          // Restore setup progress if mid-setup
          if (data.phase === "setup" && data.setup_progress) {
            setSetupProgress(data.setup_progress);
          }

          // Handle pending join trigger
          if (pendingJoinRef.current && data.phase !== "participating" && data.phase !== "setup") {
            pendingJoinRef.current = false;
            setTimeout(() => {
              sendMessageText("I'd like to join this deliberation and share my views.", data.session_id);
            }, 100);
          }
        })
        .catch(() => {
          setMessages([{ role: "assistant", content: "Sorry, I couldn't connect. Please try again." }]);
        })
        .finally(() => setLoading(false));
    }, [open, sessionId, deliberationId]);

    // Auto-scroll
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, currentActions, setupProgress]);

    // Focus input
    useEffect(() => {
      if (open && !sending && inputRef.current) {
        inputRef.current.focus();
      }
    }, [open, sending]);

    // Poll for setup progress
    useEffect(() => {
      if (phase !== "setup" || !sessionId) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      const poll = async () => {
        try {
          const res = await fetch(`/api/backend/deliberation-chat/${sessionId}/status`);
          if (!res.ok) return;
          const data = await res.json();
          setSetupProgress(data.setup_progress);
          if (data.phase === "participating") {
            setPhase("participating");
            setSetupProgress(null);
            onJoinComplete?.();
            setTimeout(() => { onScrollToAgents?.(); }, 2000);
            // Reload session to get background action messages
            try {
              const startRes = await fetch("/api/backend/deliberation-chat/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deliberation_id: deliberationId }),
              });
              if (startRes.ok) {
                const startData = await startRes.json();
                if (startData.history?.length > 0) {
                  setMessages(startData.history.map((m: Record<string, string>) => {
                    if (m.role === "action") {
                      return { role: "action" as const, action: m.action, status: m.status, description: m.description, detail: m.detail };
                    }
                    return { role: m.role as "user" | "assistant", content: m.content };
                  }));
                }
              }
            } catch {
              // ignore — messages will load on next open
            }
          }
        } catch {
          // ignore
        }
      };

      poll();
      pollRef.current = setInterval(poll, 2000);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [phase, sessionId, onJoinComplete, onScrollToAgents]);

    // SSE message sending
    const sendMessageText = useCallback(async (text: string, sid: string) => {
      if (!text || sending) return;
      setSending(true);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setCurrentActions([]);

      try {
        const res = await fetch(`/api/backend/deliberation-chat/${sid}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Something went wrong." }));
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.detail || "Something went wrong."}` }]);
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
                  if (last?.role === "assistant" && prev.length > 1) {
                    return [...prev.slice(0, -1), { role: "assistant", content: assistantText }];
                  }
                  return [...prev, { role: "assistant", content: assistantText }];
                });
              } else if (event.type === "action_start") {
                setCurrentActions((prev) => [
                  ...prev,
                  { action: event.action, status: "running" },
                ]);
              } else if (event.type === "action_done") {
                setCurrentActions((prev) =>
                  prev.map((a) =>
                    a.action === event.action && a.status === "running"
                      ? { ...a, status: "done", description: event.description, detail: event.detail }
                      : a
                  )
                );
                // Persist action to messages on completion
                setMessages((prev) => [...prev, {
                  role: "action",
                  action: event.action,
                  status: "done",
                  description: event.description,
                  detail: event.detail,
                }]);
              } else if (event.type === "phase") {
                // Phase update from backend (e.g. after submit_opinion triggers setup)
                setPhase(event.phase);
                if (event.phase === "setup" && event.setup_progress) {
                  setSetupProgress(event.setup_progress);
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
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
      } finally {
        setSending(false);
        // Clear completed actions (they're already in messages)
        setCurrentActions([]);
      }
    }, [sending]);

    const sendMessage = useCallback(() => {
      const text = input.trim();
      if (!text || !sessionId) return;
      setInput("");
      sendMessageText(text, sessionId);
    }, [input, sessionId, sendMessageText]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    const handleRetry = async () => {
      if (!sessionId) return;
      setRetrying(true);
      try {
        const res = await fetch(`/api/backend/deliberation-chat/${sessionId}/retry-setup`, { method: "POST" });
        if (res.ok) {
          setSetupProgress((prev) => prev ? { ...prev, error: null } : prev);
          setPhase("setup");
        }
      } catch {
        // ignore
      } finally {
        setRetrying(false);
      }
    };

    const headerTitle = phase === "participating" ? "Deliberation Chat"
      : phase === "setup" ? "Setting Up..."
      : "Ask About This";

    const placeholder = phase === "participating"
      ? "Ask about this deliberation..."
      : "Ask a question or join...";

    return (
      <>
        {/* Floating bubble */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 300,
              width: 52, height: 52, borderRadius: "50%",
              background: "#c84a20", color: "#fff", border: "none",
              cursor: "pointer", boxShadow: "0 4px 16px rgba(200,74,32,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, transition: "transform 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title={phase === "participating" ? "Chat about this deliberation" : "Ask about this deliberation"}
          >
            💬
          </button>
        )}

        {/* Chat panel */}
        {open && (
          <div className="delib-chat-panel" style={{
            position: "fixed", bottom: 0, right: 0, zIndex: 300,
            width: "min(370px, 100vw)", maxHeight: "min(520px, 100dvh)", borderRadius: "16px 16px 0 0",
            background: "#fff", border: "1px solid rgba(0,0,0,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(0,0,0,0.02)",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                  {headerTitle}
                </div>
                <div style={{ fontSize: 10, color: "#999", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {deliberationQuestion}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 18, color: "#999", padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "12px 16px",
              display: "flex", flexDirection: "column", gap: 10,
              minHeight: 200, maxHeight: 360,
            }}>
              {loading && (
                <div style={{ textAlign: "center", color: "#999", fontSize: 12, padding: 20 }}>
                  Loading...
                </div>
              )}
              {messages.map((msg, i) =>
                msg.role === "action" ? (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", borderRadius: 8,
                    background: msg.status === "error" ? "#fee" : "#1a8a5010",
                    fontSize: 11, color: msg.status === "error" ? "#c00" : "#1a8a50",
                  }}>
                    {msg.status === "error" ? "✗" : "✓"} {actionLabel(msg.action || "")}
                    {msg.description && <span style={{ color: "#999" }}>— {msg.description}</span>}
                  </div>
                ) : (
                  <div
                    key={i}
                    style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: msg.role === "user" ? "#c84a20" : "rgba(0,0,0,0.04)",
                      color: msg.role === "user" ? "#fff" : "#333",
                      fontSize: 13, lineHeight: 1.5,
                      whiteSpace: msg.role === "user" ? "pre-wrap" : "normal", wordBreak: "break-word",
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <div className="chat-markdown">
                        <ReactMarkdown>{(msg.content || "").replace(/\n(?!\n)/g, "\n\n")}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                )
              )}

              {/* Streaming action indicators */}
              {currentActions.map((a, i) => (
                <div key={`action-${i}`} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 8,
                  background: a.status === "done" ? "#1a8a5010" : "#fff5e6",
                  fontSize: 11, color: a.status === "done" ? "#1a8a50" : "#c84a20",
                }}>
                  <span style={a.status === "running" ? { animation: "pulse 1.5s ease-in-out infinite" } : {}}>
                    {a.status === "running" ? "⏳" : "✓"}
                  </span>
                  {actionLabel(a.action)}
                  {a.description && <span style={{ color: "#999" }}>— {a.description}</span>}
                </div>
              ))}

              {/* Setup progress */}
              {phase === "setup" && setupProgress && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                    Setting up your participation...
                  </div>
                  {SETUP_STEPS.map((step) => {
                    const completed = setupProgress.completed_steps?.includes(step.key);
                    const isCurrent = setupProgress.current_step === step.key && !completed;
                    const isFuture = !completed && !isCurrent;
                    return (
                      <div key={step.key} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 10px", borderRadius: 8,
                        background: completed ? "#1a8a5010" : isCurrent ? "#fff5e6" : "rgba(0,0,0,0.02)",
                        fontSize: 11,
                        color: completed ? "#1a8a50" : isCurrent ? "#c84a20" : "#ccc",
                      }}>
                        <span style={isCurrent ? { animation: "pulse 1.5s ease-in-out infinite" } : {}}>
                          {completed ? "✓" : isCurrent ? "⏳" : "○"}
                        </span>
                        {step.label}
                      </div>
                    );
                  })}
                  {setupProgress.error && (
                    <>
                      <div style={{
                        padding: "6px 10px", borderRadius: 8,
                        background: "#fee", fontSize: 11, color: "#c00",
                      }}>
                        Setup failed: {setupProgress.error}
                      </div>
                      <button
                        onClick={handleRetry}
                        disabled={retrying}
                        style={{
                          padding: "6px 14px", borderRadius: 8, border: "none",
                          background: "#c84a20", color: "#fff", fontSize: 11,
                          fontWeight: 600, cursor: "pointer",
                          opacity: retrying ? 0.5 : 1,
                        }}
                      >
                        {retrying ? "Retrying..." : "Retry"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Typing indicator */}
              {sending && currentActions.length === 0 && (
                <div style={{
                  alignSelf: "flex-start", padding: "8px 12px", borderRadius: 14,
                  background: "rgba(0,0,0,0.04)", fontSize: 13, color: "#999",
                }}>
                  •••
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.06)",
              display: "flex", gap: 8, alignItems: "flex-end",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || !sessionId || phase === "setup"}
                placeholder={phase === "setup" ? "Setting up — one moment..." : placeholder}
                rows={1}
                  style={{
                    flex: 1, resize: "none", border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 10, padding: "8px 12px", fontSize: 13,
                    outline: "none", fontFamily: "inherit", lineHeight: 1.4,
                    maxHeight: 80, overflowY: "auto",
                  }}
                />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim() || !sessionId || phase === "setup"}
                style={{
                  background: "#c84a20", color: "#fff", border: "none",
                  borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, opacity: sending || !input.trim() || phase === "setup" ? 0.5 : 1,
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Pulse animation + chat markdown styles */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .chat-markdown { white-space: normal; }
          .chat-markdown p { margin: 0 0 12px; }
          .chat-markdown p:last-child { margin-bottom: 0; }
          .chat-markdown p + p { margin-top: 4px; }
          .chat-markdown ul, .chat-markdown ol { margin: 4px 0; padding-left: 18px; }
          .chat-markdown li { margin-bottom: 2px; }
          .chat-markdown strong { font-weight: 700; }
          .chat-markdown em { font-style: italic; }
          .chat-markdown code { background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
          .chat-markdown pre { background: rgba(0,0,0,0.06); padding: 8px; border-radius: 6px; overflow-x: auto; margin: 4px 0; }
          .chat-markdown pre code { background: none; padding: 0; }
          .chat-markdown a { color: #c84a20; text-decoration: underline; }
          .chat-markdown h1, .chat-markdown h2, .chat-markdown h3 { font-size: 13px; font-weight: 700; margin: 8px 0 4px; }
          .chat-markdown blockquote { border-left: 2px solid rgba(0,0,0,0.15); padding-left: 8px; margin: 4px 0; color: #666; }
          @media (max-width: 640px) {
            .delib-chat-panel {
              width: 100% !important;
              max-height: 100% !important;
              height: 100% !important;
              bottom: 0 !important;
              right: 0 !important;
              border-radius: 0 !important;
            }
          }
        `}</style>
      </>
    );
  }
);

export default DeliberationChatBubble;
