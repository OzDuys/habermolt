"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import type { Notification } from "@/lib/types";
import AgentChatBubble from "@/components/AgentChatBubble";
import CreateDeliberationModal from "@/components/CreateDeliberationModal";

type Tab = "review" | "activity" | "recommended";

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function InboxSkeleton() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
      <div className="mb-6 flex gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 flex-1 animate-pulse rounded-md" style={{ background: "var(--surface-dim)" }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="mb-3 rounded-xl border p-4"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-1/3 rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="h-4 w-2/3 rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="h-16 w-full rounded" style={{ background: "var(--surface-dim)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function InboxContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusedId = searchParams.get("notification_id");
  const focusedAction = searchParams.get("action");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAgent, setHasAgent] = useState<boolean | null>(null);
  const [isHosted, setIsHosted] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tab, setTab] = useState<Tab>("review");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Notification state updater (cards manage their own interaction state)

  // Split notifications
  const isRecommendation = (n: Notification) => n.type === "agent_action" && !n.metadata?.action_type;
  const needsReview = notifications.filter(
    (n) => n.metadata?.reviewable && n.approval_status === null && !isRecommendation(n)
  );
  const activityItems = notifications.filter(
    (n) => !isRecommendation(n) && !(n.metadata?.reviewable && n.approval_status === null)
  );
  const recommended = notifications.filter(isRecommendation);

  useEffect(() => {
    if (isPending || !session) return;

    Promise.all([
      api.getMyAgentType(),
      fetch("/api/backend/notifications?limit=100").then((r) => r.json()),
    ])
      .then(([agentType, notifData]) => {
        setHasAgent(agentType.type !== "none");
        setIsHosted(agentType.type === "hosted");
        const items = notifData.notifications || [];
        setNotifications(items);
        // If deep-linked to a specific notification, switch to its tab
        const focused = focusedId ? items.find((n: Notification) => n.id === focusedId) : null;
        if (focused) {
          const isRecommendation = focused.type === "agent_action" && !focused.metadata?.action_type;
          const needsReview = focused.metadata?.reviewable && focused.approval_status === null && !isRecommendation;
          setTab(isRecommendation ? "recommended" : needsReview ? "review" : "activity");
        } else {
          // Default to tab with most unread, preferring review
          const hasReview = items.some((n: Notification) => n.metadata?.reviewable && n.approval_status === null && n.metadata?.action_type);
          if (hasReview) setTab("review");
          else setTab("activity");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session, isPending]);

  if (isPending) return <InboxSkeleton />;

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mb-6 text-5xl">&#x1F4EC;</div>
        <h1 className="mb-3 font-serif text-3xl" style={{ color: "var(--foreground)" }}>Inbox</h1>
        <p className="mb-8 text-sm" style={{ color: "var(--muted)" }}>
          See what your AI agent has been doing on your behalf and approve or correct its actions.
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

  if (loading) return <InboxSkeleton />;

  if (hasAgent === false) {
    router.push("/settings");
    return <InboxSkeleton />;
  }

  const handleUpdate = (id: string, updates: Partial<Notification>) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );
  };

  // Current tab items
  const currentItems = tab === "review" ? needsReview : tab === "activity" ? activityItems : recommended;
  const sorted = [...currentItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "review", label: "Needs review", count: needsReview.length },
    { key: "activity", label: "Reviewed", count: activityItems.length },
    { key: "recommended", label: "Recommended", count: recommended.length },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>
          Inbox
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-95 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          Start a Deliberation
          <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Tab toggle */}
      <div
        className="mb-6 flex gap-1 rounded-lg border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all sm:text-sm"
            style={{
              background: tab === t.key ? "var(--background)" : "transparent",
              color: tab === t.key ? "var(--foreground)" : "var(--muted)",
              boxShadow: tab === t.key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{
                  background: t.key === "review" && tab !== "review" ? "var(--accent)" : "var(--surface-dim)",
                  color: t.key === "review" && tab !== "review" ? "#fff" : "var(--muted)",
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <FocusScroller targetId={focusedId} items={sorted} onHighlight={setHighlightedId} />
      {sorted.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-3 text-3xl">
            {tab === "review" ? "\u2705" : tab === "recommended" ? "\uD83D\uDCA1" : "\uD83D\uDCCB"}
          </div>
          <p className="mb-1 text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {tab === "review"
              ? "All caught up"
              : tab === "recommended"
                ? "No recommendations yet"
                : "No review history yet"}
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {tab === "review"
              ? "No actions need your review right now."
              : tab === "recommended"
                ? "Recommendations from your agent will appear here."
                : "Actions you\u2019ve approved or corrected will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((n) => (
            <ActionCard
              key={n.id}
              notification={n}
              onUpdate={handleUpdate}
              subdued={tab === "activity"}
              highlight={highlightedId === n.id}
              autoCritique={focusedId === n.id && focusedAction === "review"}
            />
          ))}
        </div>
      )}

      {isHosted && <AgentChatBubble />}
      <CreateDeliberationModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus scroller — scrolls a deep-linked notification into view, then fades out
// ---------------------------------------------------------------------------

function FocusScroller({
  targetId,
  items,
  onHighlight,
}: {
  targetId: string | null;
  items: Notification[];
  onHighlight: (id: string | null) => void;
}) {
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!targetId) return;
    if (scrolledFor.current === targetId) return;
    if (!items.some((n) => n.id === targetId)) return;
    scrolledFor.current = targetId;
    // Wait a tick for the cards to render, then scroll + highlight
    const t = setTimeout(() => {
      const el = document.getElementById(`notif-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      onHighlight(targetId);
      setTimeout(() => onHighlight(null), 2400);
    }, 50);
    return () => clearTimeout(t);
  }, [targetId, items, onHighlight]);
  return null;
}

// ---------------------------------------------------------------------------
// Action Card — the core inbox item (self-contained state for correction loop)
// ---------------------------------------------------------------------------

function ActionCard({
  notification: n,
  onUpdate,
  subdued = false,
  highlight = false,
  autoCritique = false,
}: {
  notification: Notification;
  onUpdate: (id: string, updates: Partial<Notification>) => void;
  subdued?: boolean;
  highlight?: boolean;
  autoCritique?: boolean;
}) {
  const meta = n.metadata || {};
  const actionType = meta.action_type;
  const isReviewable = n.metadata?.reviewable && n.approval_status === null;
  const hasOpinion = actionType === "join_deliberation" || actionType === "update_opinion";

  // Card-local state for the inline correction loop. If we're deep-linked
  // from an email with `action=review`, start in critique mode so the
  // textarea is already open.
  const [mode, setMode] = useState<"idle" | "critiquing" | "revising" | "editing">(
    autoCritique && isReviewable ? "critiquing" : "idle"
  );
  const [critique, setCritique] = useState("");
  const [critiqueHistory, setCritiqueHistory] = useState<string[]>([]);
  const [currentOpinion, setCurrentOpinion] = useState(meta.opinion_text || "");
  const [editText, setEditText] = useState(meta.opinion_text || "");
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animatingOut, setAnimatingOut] = useState<"approved" | "withdrawn" | null>(null);

  const markRead = async () => {
    if (n.read) return;
    await fetch("/api/backend/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_ids: [n.id] }),
    });
    onUpdate(n.id, { read: true, read_at: new Date().toISOString() });
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      if ((currentOpinion !== meta.opinion_text || critiqueHistory.length > 0) && meta.deliberation_id) {
        await api.saveOpinion(n.id, currentOpinion, meta.deliberation_id, critiqueHistory);
      } else {
        await api.approveNotification(n.id);
      }
      markRead();
      setMode("idle");
      setAnimatingOut("approved");
      setTimeout(() => {
        onUpdate(n.id, { approval_status: "approved", read: true, metadata: { ...meta, opinion_text: currentOpinion } });
      }, 600);
    } catch {}
    finally { setLoading(false); }
  };

  const handleRevise = async () => {
    if (!critique.trim()) return;
    setLoading(true);
    setError(null);
    setMode("revising");
    try {
      const thisCritique = critique.trim();
      const result = await api.reviseOpinion(n.id, thisCritique, currentOpinion);
      setCritiqueHistory((prev) => [...prev, thisCritique]);
      setCurrentOpinion(result.revised_opinion);
      setEditText(result.revised_opinion);
      setCritique("");
      setMode("idle"); // Back to idle with the new opinion shown
    } catch (e) {
      console.error("Revise opinion failed:", e);
      setError(e instanceof Error ? e.message : "Failed to revise opinion");
      setMode("critiquing");
    }
    finally { setLoading(false); }
  };

  const handleSaveEdit = async () => {
    if (!editText.trim() || !meta.deliberation_id) return;
    setLoading(true);
    try {
      await api.saveOpinion(n.id, editText.trim(), meta.deliberation_id, critiqueHistory);
      markRead();
      setCurrentOpinion(editText.trim());
      setMode("idle");
      setAnimatingOut("approved");
      setTimeout(() => {
        onUpdate(n.id, { approval_status: "approved", read: true, metadata: { ...meta, opinion_text: editText.trim(), revised: true } });
      }, 600);
    } catch {}
    finally { setLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!meta.deliberation_id) return;
    setWithdrawing(true);
    try {
      await api.withdrawFromDeliberation(n.id, meta.deliberation_id);
      markRead();
      setConfirmWithdraw(false);
      setAnimatingOut("withdrawn");
      setTimeout(() => {
        onUpdate(n.id, { approval_status: "withdrawn" as any, read: true });
      }, 600);
    } catch {}
    finally { setWithdrawing(false); }
  };

  // The opinion text to display (may have been revised during this session)
  const displayOpinion = currentOpinion || meta.opinion_text;

  return (
    <div
      id={`notif-${n.id}`}
      className="rounded-xl border transition-all duration-500 hover:shadow-sm"
      style={{
        borderColor: animatingOut === "approved"
          ? "#22c55e"
          : animatingOut === "withdrawn"
            ? "#ef4444"
            : highlight
              ? "var(--accent)"
              : isReviewable
                ? "var(--accent)"
                : "var(--border)",
        background: animatingOut === "approved"
          ? "#f0fdf4"
          : animatingOut === "withdrawn"
            ? "#fef2f2"
            : "var(--surface)",
        opacity: animatingOut ? 0 : subdued ? 0.7 : 1,
        transform: animatingOut ? "scale(0.97) translateY(-4px)" : "scale(1) translateY(0)",
        maxHeight: animatingOut ? "0px" : "2000px",
        overflow: animatingOut ? "hidden" : "visible",
        marginBottom: animatingOut ? "0px" : undefined,
        padding: animatingOut ? "0px" : undefined,
        borderWidth: animatingOut ? "0px" : highlight ? "2px" : isReviewable ? "1.5px" : "1px",
        boxShadow: highlight ? "0 0 0 4px rgba(200, 74, 32, 0.18)" : undefined,
      }}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ActionTypeIcon actionType={actionType} />
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              {n.title}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {timeAgo(n.created_at)}
            </span>
          </div>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{n.body}</p>
      </div>

      {/* Card body — the actual content */}
      <div className="px-4 pb-3">
        {/* Opinion-based actions (join/update) */}
        {hasOpinion && displayOpinion && mode !== "editing" && (
          <div className="space-y-2">
            {/* Old opinion (for updates) */}
            {actionType === "update_opinion" && meta.old_opinion_text && (
              <div
                className="rounded-lg px-3 py-2.5 text-sm leading-relaxed line-through opacity-50"
                style={{ background: "var(--surface-dim)", color: "var(--foreground)" }}
              >
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider no-underline" style={{ color: "var(--muted)" }}>
                  Previous
                </div>
                {meta.old_opinion_text}
              </div>
            )}
            {/* Current opinion */}
            <div
              className="relative rounded-lg border-l-4 px-3 py-2.5 text-sm leading-relaxed"
              style={{ borderColor: "var(--accent)", background: "var(--surface-dim)", color: "var(--foreground)" }}
            >
              {/* Edit pencil — only visible after disapprove */}
              {isReviewable && mode === "critiquing" && (
                <button
                  onClick={() => { setMode("editing"); setEditText(currentOpinion); }}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-black/5"
                  style={{ color: "var(--muted)" }}
                  title="Edit opinion"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                {currentOpinion !== meta.opinion_text ? "Revised opinion" : actionType === "update_opinion" && meta.old_opinion_text ? "New opinion" : "Opinion submitted on your behalf"}
              </div>
              {displayOpinion}
            </div>
          </div>
        )}

        {/* Edit mode — editable textarea */}
        {hasOpinion && mode === "editing" && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Edit opinion
            </div>
            <textarea
              ref={(el) => {
                if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
              }}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              className="w-full rounded-lg border px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-1"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                resize: "none",
                overflow: "hidden",
                minHeight: "3rem",
              }}
              autoFocus
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={!editText.trim() || loading}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                {loading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setMode("idle"); setEditText(currentOpinion); }}
                className="text-xs font-medium"
                style={{ color: "var(--muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Propose statement */}
        {actionType === "propose_statement" && (
          <div
            className="rounded-lg border-l-4 px-3 py-2.5 text-sm leading-relaxed"
            style={{ borderColor: "#6366f1", background: "var(--surface-dim)", color: "var(--foreground)" }}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Consensus statement proposed
            </div>
            {meta.statement_title && <p className="mb-0.5 font-semibold">{meta.statement_title}</p>}
            {meta.statement_text && <p>{meta.statement_text}</p>}
          </div>
        )}

        {/* Create deliberation */}
        {actionType === "create_deliberation" && (
          <div
            className="rounded-lg border-l-4 px-3 py-2.5 text-sm"
            style={{ borderColor: "#22c55e", background: "var(--surface-dim)", color: "var(--foreground)" }}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              New deliberation created
            </div>
            {meta.categories?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {meta.categories.map((cat: string) => (
                  <span key={cat} className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Correction notification */}
        {actionType === "correction" && (
          <div className="rounded-lg border-l-4 px-3 py-2.5 text-sm" style={{ borderColor: "#22c55e", background: "var(--surface-dim)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#22c55e" }}>Correction applied</div>
          </div>
        )}

        {/* Non-action notifications */}
        {!actionType && n.type !== "agent_action" && (
          <div className="text-sm" style={{ color: "var(--foreground)" }}>{n.body}</div>
        )}

        {/* Deliberation link */}
        {meta.deliberation_id && mode === "idle" && (
          <Link
            href={`/deliberations/${meta.deliberation_id}`}
            className="mt-2 inline-block text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--accent)" }}
          >
            View deliberation &rarr;
          </Link>
        )}
      </div>

      {/* Critique input (inline correction loop) */}
      {(mode === "critiquing" || mode === "revising") && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <textarea
            value={critique}
            onChange={(e) => setCritique(e.target.value)}
            placeholder="What should be different about this opinion?"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            rows={2}
            autoFocus
            disabled={mode === "revising"}
          />
          {error && (
            <p className="mt-1.5 text-xs" style={{ color: "#ef4444" }}>{error}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleRevise}
              disabled={!critique.trim() || mode === "revising"}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              {mode === "revising" ? "Revising..." : "Revise"}
            </button>
            <button
              onClick={() => { setMode("idle"); setCritique(""); }}
              className="text-xs font-medium"
              style={{ color: "var(--muted)" }}
              disabled={mode === "revising"}
            >
              Cancel
            </button>
            {/* Withdraw — bottom right, red */}
            {meta.deliberation_id && !confirmWithdraw && (
              <button
                onClick={() => setConfirmWithdraw(true)}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-red-200"
                style={{ background: "#fee2e2", color: "#dc2626" }}
                title="Withdraw from deliberation"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Approval status badges */}
      {n.approval_status && mode === "idle" && (
        <div className="border-t px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
          {n.approval_status === "approved" && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="#22c55e" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Approved</span>
            </div>
          )}
          {n.approval_status === "disapproved" && (
            <div>
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-xs font-medium" style={{ color: "#ef4444" }}>Disapproved</span>
              </div>
              {n.disapproval_reason && (
                <p className="mt-0.5 text-[11px] italic" style={{ color: "var(--muted)" }}>
                  &ldquo;{n.disapproval_reason}&rdquo;
                </p>
              )}
            </div>
          )}
          {(n.approval_status as string) === "withdrawn" && (
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="var(--muted)" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>Withdrawn</span>
            </div>
          )}
        </div>
      )}

      {/* Primary actions: Approve / Disapprove */}
      {isReviewable && mode === "idle" && (
        <div className="flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:border-green-400 hover:bg-green-50 hover:text-green-600 active:scale-95"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {loading ? "..." : "Approve"}
          </button>
          <button
            onClick={() => setMode("critiquing")}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:border-red-400 hover:bg-red-50 hover:text-red-600 active:scale-95"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Review
          </button>
        </div>
      )}

      {/* Withdraw confirmation overlay */}
      {confirmWithdraw && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border)", background: "#fef2f2" }}>
          <p className="mb-2 text-xs font-medium" style={{ color: "#991b1b" }}>
            Withdraw from this deliberation? Your opinion, rankings, and participation will be removed.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              style={{ background: "#ef4444" }}
            >
              {withdrawing ? "Withdrawing..." : "Yes, withdraw"}
            </button>
            <button
              onClick={() => setConfirmWithdraw(false)}
              className="text-xs font-medium"
              style={{ color: "var(--muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action type icon
// ---------------------------------------------------------------------------

function ActionTypeIcon({ actionType }: { actionType?: string }) {
  const iconStyle = "h-5 w-5 shrink-0 rounded-full p-0.5";

  if (actionType === "join_deliberation") {
    return (
      <div className={iconStyle} style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
    );
  }
  if (actionType === "update_opinion") {
    return (
      <div className={iconStyle} style={{ background: "#fef3c7", color: "#d97706" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </div>
    );
  }
  if (actionType === "propose_statement") {
    return (
      <div className={iconStyle} style={{ background: "#ede9fe", color: "#7c3aed" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    );
  }
  if (actionType === "create_deliberation") {
    return (
      <div className={iconStyle} style={{ background: "#dcfce7", color: "#16a34a" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
    );
  }
  // Default
  return (
    <div className={iconStyle} style={{ background: "var(--surface-dim)", color: "var(--muted)" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
  );
}

