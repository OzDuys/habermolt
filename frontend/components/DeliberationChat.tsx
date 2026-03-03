"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface DeliberationChatProps {
  deliberationId: string;
  deliberationQuestion: string;
}

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

function actionLabel(action: string): string {
  switch (action) {
    case "update_opinion": return "Updating opinion";
    case "rerank_statements": return "Reranking statements";
    case "propose_statement": return "Proposing consensus";
    default: return action;
  }
}

export default function DeliberationChat({ deliberationId, deliberationQuestion }: DeliberationChatProps) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentActions, setCurrentActions] = useState<ActionEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session when opened
  useEffect(() => {
    if (!open || sessionId) return;
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
        // Restore history or just the greeting
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
  }, [open, sessionId, deliberationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentActions]);

  useEffect(() => {
    if (open && !sending && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, sending]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !sessionId) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setCurrentActions([]);

    try {
      const res = await fetch(`/api/deliberation-chat/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Error: Something went wrong." }]);
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
                if (last?.role === "assistant" && last.content === assistantText.slice(0, -event.content.length)) {
                  return [...prev.slice(0, -1), { role: "assistant", content: assistantText }];
                }
                if (last?.role === "user") {
                  return [...prev, { role: "assistant", content: assistantText }];
                }
                return [...prev.slice(0, -1), { role: "assistant", content: assistantText }];
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
  }, [input, sending, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

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
          title="Chat with your agent about this deliberation"
        >
          💬
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 300,
          width: 370, maxHeight: 520, borderRadius: 16,
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
              <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Deliberation Chat</div>
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
              disabled={sending || !sessionId}
              placeholder="Ask about this deliberation..."
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
        </div>
      )}
    </>
  );
}
