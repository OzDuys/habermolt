"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";

interface Message {
  role: "user" | "assistant" | "action" | "divider";
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
    case "submit_opinion": return "Submitting opinion";
    case "update_opinion": return "Updating opinion";
    case "update_profile": return "Updating profile";
    case "rerank_statements": return "Reranking statements";
    case "rank_statements": return "Ranking statements";
    case "propose_statement": return "Proposing consensus";
    default: return action;
  }
}

type Mode = "browse" | "join" | "participate";

const DeliberationChatBubble = forwardRef<DeliberationChatBubbleHandle, DeliberationChatBubbleProps>(
  function DeliberationChatBubble({ deliberationId, deliberationQuestion, alreadyParticipating, onJoinComplete, onScrollToAgents }, ref) {
    const storageKey = `delib_chat_session_${deliberationId}`;
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>(alreadyParticipating ? "participate" : "browse");
    const [sessionId, setSessionId] = useState<string | null>(() => {
      if (typeof window !== "undefined") {
        return sessionStorage.getItem(`delib_chat_session_${deliberationId}`) || null;
      }
      return null;
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(false);
    const [currentActions, setCurrentActions] = useState<ActionEvent[]>([]);
    const [setupProgress, setSetupProgress] = useState<SetupProgress | null>(null);
    const [interviewStatus, setInterviewStatus] = useState<string>("active");
    const [retrying, setRetrying] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pendingJoinRef = useRef(false);

    // Expose triggerJoin to parent
    useImperativeHandle(ref, () => ({
      triggerJoin: () => {
        if (mode === "participate") return;
        if (!open) {
          pendingJoinRef.current = true;
          setOpen(true);
        } else if (sessionId) {
          injectJoinMessage();
        }
      },
    }));

    // Initialize session when opened
    useEffect(() => {
      if (!open || sessionId) return;

      if (mode === "participate") {
        // Start deliberation-chat session
        setLoading(true);
        fetch("/api/deliberation-chat/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliberation_id: deliberationId }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error("Failed to start chat");
            const data = await res.json();
            setSessionId(data.session_id);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(storageKey, data.session_id);
            }
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
          })
          .catch(() => {
            setMessages([{ role: "assistant", content: "Sorry, I couldn't connect. Please try again." }]);
          })
          .finally(() => setLoading(false));
      } else {
        // Start topic-interview session in browse mode
        setLoading(true);
        fetch("/api/topic-interview/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliberation_id: deliberationId, browse_mode: true }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error("Failed to start session");
            const data = await res.json();
            setSessionId(data.session_id);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(storageKey, data.session_id);
            }
            // Restore full message history if resuming an existing session
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages.map((m: Record<string, string>) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              })));
              // Restore setup progress if mid-setup
              if (data.setup_progress && data.status === "setup_running") {
                setSetupProgress(data.setup_progress);
                setInterviewStatus("setup_running");
              } else if (data.status === "completed") {
                setInterviewStatus("completed");
              }
              // If opinion was already submitted, we're in join mode
              if (data.status === "opinion_submitted" || data.status === "setup_running" || data.status === "completed") {
                setMode("join");
              }
            } else {
              setMessages([{ role: "assistant", content: data.greeting }]);
            }
            // If there was a pending join trigger, inject the message
            if (pendingJoinRef.current) {
              pendingJoinRef.current = false;
              // Small delay to let state settle
              setTimeout(() => injectJoinMessageWithSession(data.session_id), 100);
            }
          })
          .catch(() => {
            setMessages([{ role: "assistant", content: "Sorry, I couldn't connect. Please try again." }]);
          })
          .finally(() => setLoading(false));
      }
    }, [open, sessionId, deliberationId, mode]);

    // Handle pending join after session is ready
    useEffect(() => {
      if (pendingJoinRef.current && sessionId && mode === "browse") {
        pendingJoinRef.current = false;
        injectJoinMessage();
      }
    }, [sessionId, mode]);

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
      if (interviewStatus !== "setup_running") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      const poll = async () => {
        if (!sessionId) return;
        try {
          const res = await fetch(`/api/topic-interview/${sessionId}/status`);
          if (!res.ok) return;
          const data = await res.json();
          setSetupProgress(data.setup_progress);
          if (data.status === "completed") {
            setInterviewStatus("completed");
            handleJoinCompleted();
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
    }, [interviewStatus, sessionId]);

    // Transition to participate mode after join completes
    const handleJoinCompleted = useCallback(() => {
      onJoinComplete?.();
      // Scroll to agents section to show the user's opinion after a delay
      setTimeout(() => { onScrollToAgents?.(); }, 3000);
      // Transition to participate mode after a short delay
      setTimeout(() => {
        setMode("participate");
        setSessionId(null);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(storageKey);
        } // Will trigger new session init for deliberation-chat
        setMessages((prev) => [
          ...prev,
          { role: "divider", content: "Now participating" },
        ]);
        setSetupProgress(null);
        setInterviewStatus("active");
        setCurrentActions([]);
      }, 2000);
    }, [onJoinComplete]);

    const injectJoinMessage = useCallback(() => {
      if (!sessionId) return;
      setMode("join");
      // Send the join message
      sendMessageText("I'd like to join this deliberation and share my views.", sessionId);
    }, [sessionId]);

    const injectJoinMessageWithSession = useCallback((sid: string) => {
      setMode("join");
      sendMessageText("I'd like to join this deliberation and share my views.", sid);
    }, []);

    const sendMessageText = useCallback(async (text: string, sid: string) => {
      if (!text || sending) return;
      setSending(true);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setCurrentActions([]);

      const isParticipateMode = mode === "participate";
      const endpoint = isParticipateMode
        ? `/api/deliberation-chat/${sid}/message`
        : `/api/topic-interview/${sid}/message`;

      try {
        const res = await fetch(endpoint, {
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
              } else if (event.type === "status") {
                setInterviewStatus(event.status);
                if (event.status === "completed") {
                  handleJoinCompleted();
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
      }
    }, [sending, mode, handleJoinCompleted]);

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
        const res = await fetch(`/api/topic-interview/${sessionId}/retry-setup`, { method: "POST" });
        if (res.ok) {
          setSetupProgress((prev) => prev ? { ...prev, error: null } : prev);
          setInterviewStatus("setup_running");
        }
      } catch {
        // ignore
      } finally {
        setRetrying(false);
      }
    };

    const isSetupRunning = interviewStatus === "setup_running";
    const chatDisabled = isSetupRunning || interviewStatus === "completed";

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
            title={alreadyParticipating ? "Chat about this deliberation" : "Ask about this deliberation"}
          >
            💬
          </button>
        )}

        {/* Backdrop when chat is open */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 299,
              background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)",
            }}
          />
        )}

        {/* Chat panel */}
        {open && (
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 300,
            width: "min(92vw, 480px)",
            maxHeight: "min(80vh, 600px)",
            borderRadius: 20,
            background: "#fff", border: "1px solid rgba(0,0,0,0.1)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(0,0,0,0.02)",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                  {mode === "participate" ? "Deliberation Chat" : mode === "join" ? "Joining Deliberation" : "Ask About This"}
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
                msg.role === "divider" ? (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 0", fontSize: 10, color: "#999",
                  }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
                    <span>{msg.content}</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
                  </div>
                ) : msg.role === "action" ? (
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
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}
                  >
                    {msg.content}
                  </div>
                )
              )}

              {/* Action indicators */}
              {currentActions.map((a, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 8,
                  background: a.status === "done" ? "#1a8a5010" : "#fff5e6",
                  fontSize: 11, color: a.status === "done" ? "#1a8a50" : "#c84a20",
                }}>
                  {a.status === "running" ? "⏳" : "✓"} {actionLabel(a.action)}
                  {a.description && <span style={{ color: "#999" }}>— {a.description}</span>}
                </div>
              ))}

              {/* Setup progress (join mode) */}
              {isSetupRunning && setupProgress && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999" }}>
                    Setting up your deliberation...
                  </div>
                  {SETUP_STEPS.map((step) => {
                    const completed = setupProgress.completed_steps?.includes(step.key);
                    const isCurrent = setupProgress.current_step === step.key && !completed;
                    if (!completed && !isCurrent) return null;
                    return (
                      <div key={step.key} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 10px", borderRadius: 8,
                        background: completed ? "#1a8a5010" : "#fff5e6",
                        fontSize: 11, color: completed ? "#1a8a50" : "#c84a20",
                      }}>
                        {completed ? "✓" : "⏳"} {step.label}
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

            {/* Submit Opinion CTA — shown after first user message while in browse mode */}
            {mode === "browse" && messages.filter(m => m.role === "user").length >= 1 && !sending && sessionId && (
              <div style={{
                padding: "8px 12px", borderTop: "1px solid rgba(0,0,0,0.06)",
                background: "rgba(200,74,32,0.03)",
              }}>
                <button
                  onClick={() => injectJoinMessage()}
                  style={{
                    width: "100%", padding: "10px 16px", borderRadius: 10, border: "none",
                    background: "#c84a20", color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", letterSpacing: -0.2,
                  }}
                >
                  Submit My Opinion →
                </button>
              </div>
            )}

            {/* Input */}
            {!chatDisabled && (
              <div style={{
                padding: "10px 12px", borderTop: "1px solid rgba(0,0,0,0.06)",
                display: "flex", gap: 8, alignItems: "flex-end",
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending || !sessionId}
                  placeholder={mode === "participate" ? "Ask about this deliberation..." : "Ask a question or join..."}
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
                  disabled={sending || !input.trim() || !sessionId}
                  style={{
                    background: "#c84a20", color: "#fff", border: "none",
                    borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, opacity: sending || !input.trim() ? 0.5 : 1,
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }
);

export default DeliberationChatBubble;
