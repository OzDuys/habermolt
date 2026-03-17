"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { api } from "@/lib/api";

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [disapprovingId, setDisapprovingId] = useState<string | null>(null);
  const [disapprovalReason, setDisapprovalReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCount = () => {
      fetch("/api/backend/notifications/unread-count")
        .then((r) => r.json())
        .then((d) => setCount(d.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backend/notifications?limit=20");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {}
    finally { setLoading(false); }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  const markAllRead = async () => {
    await fetch("/api/backend/notifications/mark-all-read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setCount(0);
  };

  const markRead = async (id: string) => {
    await fetch("/api/backend/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setCount((c) => Math.max(0, c - 1));
  };

  const markReadAndUpdate = (id: string) => {
    const n = notifications.find((x) => x.id === id);
    if (n && !n.read) markRead(id);
  };

  const handleApprove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.approveNotification(id);
      markReadAndUpdate(id);
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, approval_status: "approved" as const, read: true } : n)
      );
    } catch {}
  };

  const handleStartDisapprove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDisapprovingId(id);
    setDisapprovalReason("");
  };

  const handleSubmitDisapproval = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disapprovalReason.trim()) return;
    setSubmitting(true);
    try {
      const result = await api.disapproveNotification(id, disapprovalReason.trim());
      markReadAndUpdate(id);
      // If correction ran successfully, mark as corrected immediately
      const corrected = result?.correction?.status === "corrected";
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                approval_status: "disapproved" as const,
                disapproval_reason: disapprovalReason.trim(),
                corrected_at: corrected ? new Date().toISOString() : null,
                read: true,
              }
            : n
        )
      );
      setDisapprovingId(null);
      setDisapprovalReason("");
    } catch {}
    finally { setSubmitting(false); }
  };

  const handleRevert = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation();
    const meta = n.metadata;
    if (!meta?.deliberation_id || !meta?.old_opinion_text) return;
    setReverting(n.id);
    try {
      await api.revertOpinion(meta.deliberation_id, meta.old_opinion_text);
      // Mark as disapproved with automatic reason
      await api.disapproveNotification(n.id, "Reverted to previous opinion.");
      setNotifications((prev) =>
        prev.map((x) =>
          x.id === n.id
            ? { ...x, approval_status: "disapproved" as const, disapproval_reason: "Reverted to previous opinion.", corrected_at: new Date().toISOString(), read: true }
            : x
        )
      );
      markReadAndUpdate(n.id);
    } catch {}
    finally { setReverting(null); }
  };

  const isReviewable = (n: Notification) =>
    n.type === "agent_action" && n.approval_status === null && n.metadata?.reviewable;

  const hasExpandableDetail = (n: Notification) =>
    n.type === "agent_action" && n.metadata && (
      n.metadata.opinion_text ||
      n.metadata.statement_text
    );

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedId((prev) => prev === id ? null : id);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:opacity-80"
        style={{ color: "var(--muted)" }}
        aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ""}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <div
        className="absolute right-0 top-full z-[200] mt-2 w-80 overflow-hidden rounded-xl border shadow-xl sm:w-96"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(-4px)",
          transition: "opacity 150ms ease-out, transform 150ms ease-out",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              No notifications yet.
            </div>
          ) : (
            <div>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`border-b px-4 py-3 transition-colors last:border-b-0 ${(!n.read || n.metadata?.deliberation_id || hasExpandableDetail(n)) ? "cursor-pointer hover:opacity-90" : ""}`}
                  style={{
                    borderColor: "var(--border)",
                    background: !n.read ? "var(--surface)" : "transparent",
                    borderLeft: !n.read ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                  onClick={(e) => {
                    if (!n.read) markRead(n.id);
                    if (hasExpandableDetail(n)) {
                      toggleExpand(e, n.id);
                      return;
                    }
                    const delibId = n.metadata?.deliberation_id;
                    if (delibId) {
                      setOpen(false);
                      router.push(`/deliberations/${delibId}`);
                    }
                  }}
                >
                  <div className="mb-0.5 flex items-start gap-2">
                    <TypeIcon type={n.type} />
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug" style={{ color: "var(--foreground)" }}>{n.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      {hasExpandableDetail(n) && (
                        <svg
                          className="h-3 w-3 transition-transform"
                          style={{
                            color: "var(--muted)",
                            transform: expandedId === n.id ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{n.body}</p>

                  {/* Expanded detail */}
                  {expandedId === n.id && (
                    <ExpandedDetail
                      notification={n}
                      onRevert={handleRevert}
                      reverting={reverting === n.id}
                    />
                  )}

                  {/* Approval status badges */}
                  {n.approval_status === "approved" && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[11px] font-medium" style={{ color: "#22c55e" }}>Approved</span>
                    </div>
                  )}

                  {n.approval_status === "disapproved" && (
                    <div className="mt-1.5">
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-[11px] font-medium" style={{ color: n.corrected_at ? "#22c55e" : "#ef4444" }}>
                          {n.corrected_at ? "Corrected" : "Disapproved — correcting..."}
                        </span>
                      </div>
                      {n.disapproval_reason && (
                        <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--muted)" }}>
                          &ldquo;{n.disapproval_reason}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {/* Approve/Disapprove buttons for reviewable actions */}
                  {isReviewable(n) && (
                    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleApprove(e, n.id)}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-green-400 hover:text-green-500"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Approve
                      </button>
                      <button
                        onClick={(e) => handleStartDisapprove(e, n.id)}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-red-400 hover:text-red-500"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Disapprove
                      </button>
                    </div>
                  )}

                  {/* Disapproval reason input */}
                  {disapprovingId === n.id && (
                    <form
                      className="mt-2"
                      onSubmit={(e) => handleSubmitDisapproval(e, n.id)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <textarea
                        value={disapprovalReason}
                        onChange={(e) => setDisapprovalReason(e.target.value)}
                        placeholder="What did your agent get wrong?"
                        className="w-full rounded-md border px-2.5 py-1.5 text-xs outline-none focus:ring-1"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--background)",
                          color: "var(--foreground)",
                        }}
                        rows={2}
                        autoFocus
                      />
                      <div className="mt-1.5 flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={!disapprovalReason.trim() || submitting}
                          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
                          style={{ background: "#ef4444" }}
                        >
                          {submitting ? "Correcting..." : "Submit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisapprovingId(null)}
                          className="text-[11px] font-medium"
                          style={{ color: "var(--muted)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function ExpandedDetail({
  notification: n,
  onRevert,
  reverting,
}: {
  notification: Notification;
  onRevert: (e: React.MouseEvent, n: Notification) => void;
  reverting: boolean;
}) {
  const meta = n.metadata;
  if (!meta) return null;

  const actionType = meta.action_type;
  const hasOldOpinion = !!meta.old_opinion_text;

  return (
    <div
      className="mt-2 rounded-lg border px-3 py-2.5"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Join deliberation — show the opinion submitted */}
      {actionType === "join_deliberation" && meta.opinion_text && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Opinion submitted
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
            {meta.opinion_text}
          </p>
        </div>
      )}

      {/* Update opinion — show old → new comparison */}
      {actionType === "update_opinion" && meta.opinion_text && (
        <div>
          {hasOldOpinion && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Previous opinion
              </div>
              <p className="text-xs leading-relaxed line-through opacity-60" style={{ color: "var(--foreground)" }}>
                {meta.old_opinion_text}
              </p>
              <div className="my-1.5 flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span className="text-[10px]">changed to</span>
              </div>
            </>
          )}
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {hasOldOpinion ? "New opinion" : "Updated opinion"}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
            {meta.opinion_text}
          </p>
          {/* Revert button */}
          {hasOldOpinion && n.approval_status === null && (
            <button
              onClick={(e) => onRevert(e, n)}
              disabled={reverting}
              className="mt-2 flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-orange-400 hover:text-orange-500 disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              {reverting ? "Reverting..." : "Revert to previous"}
            </button>
          )}
        </div>
      )}

      {/* Propose statement — show title + text */}
      {actionType === "propose_statement" && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Consensus statement proposed
          </div>
          {meta.statement_title && (
            <p className="mb-0.5 text-xs font-semibold" style={{ color: "var(--foreground)" }}>
              {meta.statement_title}
            </p>
          )}
          {meta.statement_text && (
            <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
              {meta.statement_text}
            </p>
          )}
        </div>
      )}

      {/* Create deliberation — show categories */}
      {actionType === "create_deliberation" && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            New deliberation created
          </div>
          {meta.categories && meta.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {meta.categories.map((cat: string) => (
                <span
                  key={cat}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--surface)", color: "var(--muted)" }}
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Correction — show what was fixed */}
      {actionType === "correction" && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#22c55e" }}>
            Correction applied
          </div>
        </div>
      )}

      {/* Link to deliberation */}
      {meta.deliberation_id && (
        <a
          href={`/deliberations/${meta.deliberation_id}`}
          className="mt-2 inline-block text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          View deliberation &rarr;
        </a>
      )}
    </div>
  );
}


function TypeIcon({ type }: { type: string }) {
  const color = type === "interview_needed" ? "var(--accent)" : type === "rate_agent" ? "var(--accent)" : type === "limit_approaching" ? "#ef4444" : "var(--muted)";
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
      {type === "agent_action" && <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />}
      {type === "rate_agent" && <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />}
      {type === "interview_needed" && <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />}
      {type === "limit_approaching" && <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />}
      {type === "consensus_shifted" && <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
    </svg>
  );
}
