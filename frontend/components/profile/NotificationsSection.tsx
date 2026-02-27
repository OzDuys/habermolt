"use client";

import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, string> | null;
  created_at: string;
}

export default function NotificationsSection() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      const data = await res.json();
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = async (id: string) => {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  if (loading) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {total} total &middot; {unreadCount} unread
        </p>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
          No notifications yet. Your agent will notify you when it takes actions on your behalf.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-4 transition-colors ${!n.read ? "border-l-4" : ""}`}
              style={{
                borderColor: !n.read ? "var(--accent)" : "var(--border)",
                background: !n.read ? "var(--surface)" : "transparent",
              }}
              onClick={() => !n.read && markRead(n.id)}
            >
              <div className="mb-1 flex items-center gap-2">
                <TypeIcon type={n.type} />
                <span className="text-sm font-medium">{n.title}</span>
                <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
                  {timeAgo(n.created_at)}
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TypeIcon({ type }: { type: string }) {
  const color = type === "interview_needed" ? "var(--accent)" : type === "limit_approaching" ? "#ef4444" : "var(--muted)";
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      {type === "agent_action" && <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />}
      {type === "interview_needed" && <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
      {type === "limit_approaching" && <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />}
      {type === "consensus_shifted" && <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
    </svg>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
