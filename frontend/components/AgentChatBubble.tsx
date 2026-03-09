"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

// --- Types ---

interface ActionItem {
  type: string;
  deliberation: string;
  deliberationId?: string;
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

// --- Constants ---

const ACTION_ICONS: Record<string, string> = {
  join_deliberation: "\uD83D\uDCAC",
  rank_statements: "\uD83D\uDDF3\uFE0F",
  add_statement: "\uD83D\uDCDD",
  propose_statement: "\uD83D\uDCDD",
  ask_before_acting: "\uD83D\uDCAC",
  suggest_deliberation: "\uD83D\uDC49",
  checking: "\uD83D\uDD0D",
  run_heartbeat: "\uD83D\uDE80",
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
  suggest_deliberation: "Suggested for you",
  checking: "Checking",
  run_heartbeat: "Running heartbeat",
  get_agent_status: "Checked status",
  update_profile: "Profile updated",
  unknown: "Action",
};

function cleanMessage(content: string): string {
  if (!content) return "";
  const idx = content.indexOf("PROFILE_UPDATE:");
  if (idx !== -1) return content.substring(0, idx).trim();
  const legacyIdx = content.indexOf("INTERVIEW_COMPLETE");
  if (legacyIdx !== -1) return content.substring(0, legacyIdx).trim();
  return content;
}

// --- Component ---

export default function AgentChatBubble() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [runningHeartbeat, setRunningHeartbeat] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageQueueRef = useRef<string[]>([]);
  const streamingRef = useRef(false);

  // Load chat + history on first open
  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      fetch("/api/backend/hosted-agents/me/chat").then((r) => r.json()),
      fetch("/api/backend/hosted-agents/me/chat/history").then((r) => r.json()),
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
      const sorted = (Array.isArray(chatHistory) ? chatHistory : [])
        .sort((a: ChatSessionSummary, b: ChatSessionSummary) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      setSessions(sorted);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open, loaded]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (open && !streaming && !runningHeartbeat && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, streaming, runningHeartbeat]);

  const processQueue = useCallback(() => {
    if (streamingRef.current || messageQueueRef.current.length === 0) return;
    const next = messageQueueRef.current.shift()!;
    doSendMessage(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const doSendMessage = async (content: string) => {
    setStreaming(true);
    streamingRef.current = true;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const unsend = () => {
      setMessages((prev) => {
        // Remove the blank assistant message and the user message before it
        const filtered = [...prev];
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (filtered[i].role === "assistant" && !filtered[i].content) {
            filtered.splice(i, 1);
            break;
          }
        }
        for (let i = filtered.length - 1; i >= 0; i--) {
          if (filtered[i].role === "user" && filtered[i].content === content) {
            filtered.splice(i, 1);
            break;
          }
        }
        return filtered;
      });
      setInput(content);
    };

    try {
      const res = await fetch("/api/backend/hosted-agents/me/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, session_id: activeSessionId }),
      });

      if (!res.ok || !res.body) {
        unsend();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let receivedContent = false;
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
                  role: "action", content: "",
                  actions: [{ type: event.action, deliberation: event.question || "", deliberationId: event.deliberation_id || undefined, status: "running" }],
                }];
              });
            } else if (event.type === "action_done") {
              const actionKey = `${event.action}-${event.question || ""}`;
              const msgIdx = actionMsgIndices.get(actionKey);
              setMessages((prev) => {
                if (msgIdx !== undefined && msgIdx < prev.length) {
                  const updated = [...prev];
                  updated[msgIdx] = {
                    role: "action", content: "",
                    actions: [{ type: event.action, deliberation: event.question || "", deliberationId: event.deliberation_id || undefined, status: "done", detail: event.detail || "", reasoning: event.reasoning || "" }],
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
                    updated[i] = { role: "assistant", content: event.content || "Something went wrong." };
                    break;
                  }
                }
                return updated;
              });
            }
          } catch {}
        }
      }

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
        unsend();
      }
    } catch {
      unsend();
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      processQueue();
    }
  };

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;
    const trimmed = content.trim();
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    if (streamingRef.current) {
      messageQueueRef.current.push(trimmed);
    } else {
      doSendMessage(trimmed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const handleHeartbeat = async () => {
    if (streaming || runningHeartbeat) return;
    setRunningHeartbeat(true);

    setMessages((prev) => [
      ...prev,
      { role: "action", content: "", actions: [{ type: "checking", deliberation: "Checking deliberations...", status: "running" }] },
    ]);
    const checkingIdx = messages.length;

    try {
      const res = await fetch("/api/backend/hosted-agents/me/heartbeat/stream", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setMessages((prev) => {
          const updated = [...prev];
          if (checkingIdx < updated.length) {
            updated[checkingIdx] = { role: "assistant", content: data.detail || "Something went wrong." };
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
                  role: "action", content: "",
                  actions: [{ type: event.action, deliberation: event.question || "", deliberationId: event.deliberation_id || undefined, status: "running" }],
                }];
              });
            } else if (event.type === "action_done") {
              const actionKey = `${event.action}-${event.question || ""}`;
              const msgIdx = actionMsgIndices.get(actionKey);
              setMessages((prev) => {
                if (msgIdx !== undefined && msgIdx < prev.length) {
                  const updated = [...prev];
                  updated[msgIdx] = {
                    role: "action", content: "",
                    actions: [{ type: event.action, deliberation: event.question || "", deliberationId: event.deliberation_id || undefined, status: "done", detail: event.detail || "", reasoning: event.reasoning || "" }],
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
                  updated[msgIdx] = { role: "action", content: "", actions: [{ ...updated[msgIdx].actions![0], status: "error" }] };
                  return updated;
                }
                return prev;
              });
            } else if (event.type === "ask_input") {
              setMessages((prev) => [...prev, { role: "assistant", content: event.message }]);
            } else if (event.type === "error") {
              setMessages((prev) => [...prev, { role: "assistant", content: event.message }]);
            } else if (event.type === "text") {
              setMessages((prev) => [...prev, { role: "assistant", content: event.content }]);
            } else if (event.type === "done") {
              if (!firstRealAction) {
                setMessages((prev) => {
                  const updated = [...prev];
                  if (checkingIdx < updated.length) {
                    updated[checkingIdx] = { role: "assistant", content: "Everything is up to date — no actions needed." };
                  }
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to reach the server." }]);
    } finally {
      setRunningHeartbeat(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    if (sessionId === activeSessionId) { setShowSessionPicker(false); return; }
    try {
      const res = await fetch(`/api/backend/hosted-agents/me/chat/${sessionId}`);
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
    setShowSessionPicker(false);
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveSessionId(null);
    setShowSessionPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const busy = streaming || runningHeartbeat;

  return (
    <>
      {/* Floating bubble */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="chat-bubble"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={() => setOpen(true)}
            style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 140,
              width: 52, height: 52, borderRadius: "50%",
              background: "#c84a20", color: "#fff", border: "none",
              cursor: "pointer", boxShadow: "0 4px 16px rgba(200,74,32,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="Chat with your agent"
          >
            💬
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            className="agent-chat-panel"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              position: "fixed", bottom: 0, right: 0, zIndex: 140,
              width: expanded ? "min(480px, 100vw)" : "min(370px, 100vw)",
              height: expanded ? "min(600px, 100dvh)" : "min(520px, 100dvh)",
              borderRadius: "16px 16px 0 0",
              background: "#fff", border: "1px solid rgba(0,0,0,0.1)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              display: "flex", flexDirection: "column", overflow: "hidden",
              transformOrigin: "bottom right",
              transition: "width 0.3s ease, height 0.3s ease",
            }}
          >
          {/* Header */}
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(0,0,0,0.02)", position: "relative",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Agent Chat</div>
              {/* Session picker toggle */}
              {sessions.length > 0 && (
                <button
                  onClick={() => setShowSessionPicker(!showSessionPicker)}
                  style={{
                    background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6,
                    padding: "2px 6px", fontSize: 10, color: "#999", cursor: "pointer",
                  }}
                >
                  {sessions.length} sessions ▾
                </button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {activeSessionId && (
                <button
                  onClick={handleNewChat}
                  style={{
                    background: "none", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6,
                    padding: "2px 8px", fontSize: 10, color: "#666", cursor: "pointer",
                  }}
                >
                  + New
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                title={expanded ? "Collapse" : "Expand"}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                {expanded ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M10 2h4v4M6 14H2v-4M10.5 5.5L14 2M5.5 10.5L2 14" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M14 6V2h-4M2 10v4h4M14 2L9.5 6.5M2 14l4.5-4.5" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Minimize"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
            </div>

            {/* Session picker dropdown */}
            {showSessionPicker && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.1)",
                maxHeight: 200, overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "8px 16px", border: "none", cursor: "pointer",
                      background: s.id === activeSessionId ? "rgba(200,74,32,0.05)" : "transparent",
                      borderBottom: "1px solid rgba(0,0,0,0.04)",
                      fontSize: 11, color: "#333",
                    }}
                  >
                    <div style={{ fontWeight: s.id === activeSessionId ? 600 : 400 }}>
                      {s.topic || "Chat"}
                    </div>
                    <div style={{ fontSize: 10, color: "#999" }}>
                      {new Date(s.created_at).toLocaleDateString()} · {s.message_count} messages
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: 10,
            minHeight: 200,
          }}>
            {!loaded && (
              <div style={{ textAlign: "center", color: "#999", fontSize: 12, padding: 20 }}>Loading...</div>
            )}
            {loaded && messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#999", fontSize: 12, padding: 20 }}>
                <div style={{ fontWeight: 500, color: "#333", marginBottom: 4 }}>Chat with your agent</div>
                <div>Teach it your values so it can represent you in deliberations.</div>
              </div>
            )}
            {messages.map((msg, i) =>
              msg.role === "action" && msg.actions ? (
                <BubbleActionCard key={i} action={msg.actions[0]} />
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
                  {msg.role === "assistant" && msg.content ? (
                    <div className="chat-markdown">
                      <ReactMarkdown>{(msg.content).replace(/\n(?!\n)/g, "\n\n")}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content || <span style={{ color: "#999" }}>•••</span>
                  )}
                </div>
              )
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
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKeyDown}
              disabled={runningHeartbeat}
              placeholder="Type a message..."
              rows={1}
              style={{
                flex: 1, resize: "none", border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 10, padding: "8px 12px", fontSize: 13,
                outline: "none", fontFamily: "inherit", lineHeight: 1.4,
                maxHeight: 120, overflowY: "auto",
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={runningHeartbeat || !input.trim()}
              style={{
                background: "#c84a20", color: "#fff", border: "none",
                borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                fontSize: 13, fontWeight: 600, opacity: runningHeartbeat || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
            <button
              onClick={handleHeartbeat}
              disabled={busy}
              title="Run heartbeat — check deliberations and participate"
              style={{
                border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10,
                padding: "8px 10px", background: "transparent", cursor: "pointer",
                fontSize: 16, opacity: busy ? 0.5 : 1,
              }}
            >
              {runningHeartbeat ? <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>🚀</span> : "🚀"}
            </button>
          </div>
        </motion.div>
        )}
      </AnimatePresence>
      <style>{`
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
          .agent-chat-panel {
            width: calc(100vw - 16px) !important;
            max-height: 70dvh !important;
            bottom: 8px !important;
            right: 8px !important;
            border-radius: 16px !important;
          }
        }
      `}</style>
    </>
  );
}

// --- Compact action card for bubble ---

function BubbleActionCard({ action }: { action: ActionItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = action.status === "done" && (action.detail || action.reasoning);
  const isSuggestion = action.type === "suggest_deliberation";

  if (isSuggestion) {
    return (
      <div
        style={{
          alignSelf: "flex-start", maxWidth: "90%",
          padding: "8px 12px", borderRadius: 10,
          background: "rgba(200,74,32,0.05)", border: "1px solid rgba(200,74,32,0.15)",
          fontSize: 11,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span>{ACTION_ICONS[action.type]}</span>
          <span style={{ color: "#999", fontWeight: 500, fontSize: 10 }}>
            {ACTION_LABELS[action.type]}
          </span>
        </div>
        {action.deliberationId ? (
          <Link href={`/deliberations/${action.deliberationId}`} style={{ display: "block", color: "#c84a20", fontSize: 12, fontWeight: 500, textDecoration: "none", marginBottom: 2 }}>
            {action.deliberation}
          </Link>
        ) : (
          <div style={{ color: "#333", fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
            {action.deliberation}
          </div>
        )}
        {action.detail && (
          <div style={{ color: "#666", fontSize: 10, lineHeight: 1.4 }}>{action.detail}</div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        alignSelf: "flex-start", maxWidth: "90%",
        padding: "6px 10px", borderRadius: 10,
        background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)",
        fontSize: 11,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: hasDetails ? "pointer" : "default" }}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span>{ACTION_ICONS[action.type] || "⚡"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: "#999", fontWeight: 500 }}>
            {ACTION_LABELS[action.type] || action.type}
          </span>
          {action.deliberation && action.type !== "checking" && (
            action.deliberationId ? (
              <Link href={`/deliberations/${action.deliberationId}`} style={{ display: "block", color: "#c84a20", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>
                {action.deliberation}
              </Link>
            ) : (
              <div style={{ color: "#333", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {action.deliberation}
              </div>
            )
          )}
        </div>
        <span style={{ fontSize: 10 }}>
          {hasDetails && <span style={{ color: "#999", marginRight: 2 }}>{expanded ? "▾" : "▸"}</span>}
          {action.status === "running" ? (
            <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⏳</span>
          ) : action.status === "error" ? (
            <span style={{ color: "red" }}>✕</span>
          ) : (
            <span style={{ color: "#c84a20" }}>✓</span>
          )}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 4, paddingLeft: 22, fontSize: 10, color: "#666", lineHeight: 1.5 }}>
          {action.reasoning && <div><b>Reasoning:</b> {action.reasoning}</div>}
          {action.detail && <div style={{ whiteSpace: "pre-wrap" }}><b>Detail:</b> {action.detail}</div>}
        </div>
      )}
    </div>
  );
}
