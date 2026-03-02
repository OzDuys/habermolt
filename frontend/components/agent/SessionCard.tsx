"use client";

import { motion } from "framer-motion";

export interface UnifiedSession {
  id: string;
  type: "chat" | "heartbeat";
  topic: string | null;
  messageCount: number;
  actionSummary: string[];
  createdAt: string;
  snippet: string | null;
}

export default function SessionCard({
  session,
  isActive,
  onClick,
}: {
  session: UnifiedSession;
  isActive: boolean;
  onClick: () => void;
}) {
  const isChat = session.type === "chat";
  const icon = isChat ? "\uD83D\uDCAC" : "\u2764\uFE0F";
  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="shrink-0 cursor-pointer rounded-xl border p-3 select-none"
      style={{
        width: "12rem",
        borderColor: isActive ? "var(--accent)" : "var(--border)",
        background: "var(--surface)",
        boxShadow: isActive
          ? "0 0 0 2px var(--accent)"
          : "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Badge + date */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: isChat ? "var(--accent-light)" : "var(--surface-dim)",
            color: isChat ? "var(--accent)" : "var(--muted)",
          }}
        >
          <span className="text-xs">{icon}</span>
          {isChat ? "Chat" : "Heartbeat"}
        </span>
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
          {session.messageCount > 0 && `${session.messageCount} msg`}
          {!isChat && session.actionSummary.length > 0 && `${session.actionSummary.length} actions`}
        </span>
      </div>

      {/* Topic / summary */}
      <p
        className="mb-1 text-xs font-medium leading-tight line-clamp-2"
        style={{ color: "var(--foreground)" }}
      >
        {session.topic
          ? session.topic.length > 60
            ? session.topic.slice(0, 60) + "..."
            : session.topic
          : isChat
            ? "General conversation"
            : session.actionSummary[0] || "Agent actions"}
      </p>

      {/* Date */}
      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
        {dateStr}
      </p>

      {/* Snippet */}
      {session.snippet && (
        <p
          className="mt-1.5 text-[10px] leading-tight line-clamp-2"
          style={{ color: "var(--muted)" }}
        >
          {session.snippet}
        </p>
      )}
    </motion.div>
  );
}
