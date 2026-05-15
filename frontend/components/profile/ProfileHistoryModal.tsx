"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { diffLines } from "diff";

import type { ProfileSnapshot } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const TRIGGER_META: Record<
  ProfileSnapshot["trigger"],
  { label: string; icon: string }
> = {
  manual_edit: { label: "You edited the profile", icon: "✏️" },
  agent_creation: { label: "Initial setup", icon: "🚀" },
  chat_extraction: { label: "Updated from chat", icon: "💬" },
  deliberation_extraction: {
    label: "Updated from deliberation interview",
    icon: "🗣️",
  },
  approval_rewrite: { label: "After you approved an action", icon: "✅" },
  withdrawal_rewrite: { label: "After you withdrew", icon: "↩️" },
  profile_rebuild: { label: "Rebuilt from sessions", icon: "🔁" },
  profile_import: { label: "Imported external memory", icon: "📥" },
};

type DiffHunk = { value: string; added?: boolean; removed?: boolean; count?: number };

function DiffPanes({
  snapshot,
  currentProfile,
  diffHunks,
}: {
  snapshot: ProfileSnapshot;
  currentProfile: string;
  diffHunks: DiffHunk[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstChangeRef = useRef<HTMLPreElement | null>(null);

  const isPlaceholder =
    snapshot.source_type === "backfill_unrecovered" && snapshot.profile_version === 0;

  // Split each diff hunk into individual lines so we can render one grid row
  // per line. This gives VS Code-style alignment: identical lines sit at the
  // same vertical row on both sides; lines only in the snapshot leave the
  // right cell empty; lines only in current leave the left cell empty.
  type Row = { left: string | null; right: string | null; kind: "keep" | "add" | "rem" };
  const rows: Row[] = [];
  if (!isPlaceholder) {
    for (const h of diffHunks) {
      // diffLines hunks end with "\n"; split into individual lines and drop
      // the trailing empty string from the final newline.
      const lines = h.value.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      for (const ln of lines) {
        if (h.added) rows.push({ left: null, right: ln, kind: "add" });
        else if (h.removed) rows.push({ left: ln, right: null, kind: "rem" });
        else rows.push({ left: ln, right: ln, kind: "keep" });
      }
    }
  }

  let firstChangeRendered = false;

  // On selection change, scroll to the first changed row so the user lands
  // where the diff actually starts instead of at the top of unchanged text.
  useEffect(() => {
    const container = scrollRef.current;
    const target = firstChangeRef.current;
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop - 24;
    container.scrollTo({ top: Math.max(0, offset), behavior: "auto" });
  }, [snapshot.id]);

  return (
    <div className="flex h-full flex-col px-4 py-4 sm:px-6">
      <div className="mb-3 grid grid-cols-2 gap-3 text-xs font-medium text-stone-500">
        <div>
          {isPlaceholder ? (
            "Earlier edits"
          ) : (
            <>
              Version {snapshot.profile_version} ·{" "}
              <span className="font-normal text-stone-400">
                {new Date(snapshot.created_at).toLocaleString()}
              </span>
            </>
          )}
        </div>
        <div>Current profile</div>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-stone-200 bg-white"
      >
        {isPlaceholder ? (
          <div className="grid grid-cols-2">
            <div className="border-r border-stone-200 px-3 py-2 text-stone-500">
              Profile content from before this point isn&rsquo;t stored. Habermolt
              only began retaining full snapshots on every edit recently.
            </div>
            <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-stone-700">
              {currentProfile || "(empty)"}
            </pre>
          </div>
        ) : (
          <div className="grid grid-cols-2 font-mono text-[11px] leading-relaxed">
            {rows.map((row, idx) => {
              const isFirstChange = row.kind !== "keep" && !firstChangeRendered;
              if (isFirstChange) firstChangeRendered = true;
              const leftBg = row.kind === "rem" ? "bg-red-50" : row.left === null ? "bg-stone-50" : "";
              const rightBg = row.kind === "add" ? "bg-green-50" : row.right === null ? "bg-stone-50" : "";
              const leftText = row.kind === "rem" ? "text-red-900" : "text-stone-700";
              const rightText = row.kind === "add" ? "text-green-900" : "text-stone-700";
              return (
                <div key={idx} className="contents">
                  <pre
                    ref={isFirstChange ? firstChangeRef : null}
                    className={`whitespace-pre-wrap break-words border-r border-stone-100 px-3 ${leftBg} ${leftText}`}
                  >
                    {row.left ?? " "}
                  </pre>
                  <pre
                    className={`whitespace-pre-wrap break-words px-3 ${rightBg} ${rightText}`}
                  >
                    {row.right ?? " "}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function sourceHref(snapshot: ProfileSnapshot): string | null {
  if (!snapshot.source_id) return null;
  if (snapshot.source_type === "chat_session") {
    return `/agent-activity?session=${snapshot.source_id}`;
  }
  if (snapshot.source_type === "notification") {
    return `/inbox?notification_id=${snapshot.source_id}`;
  }
  return null;
}

export default function ProfileHistoryModal({
  open,
  onClose,
  currentProfile,
}: {
  open: boolean;
  onClose: () => void;
  currentProfile: string;
}) {
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || snapshots !== null) return;
    setLoading(true);
    setError(null);
    fetch("/api/backend/hosted-agents/me/profile/history")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
        return res.json();
      })
      .then((data: ProfileSnapshot[]) => {
        setSnapshots(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((err) => setError(err.message || "Failed to load history"))
      .finally(() => setLoading(false));
  }, [open, snapshots]);

  const selected = useMemo(
    () => (snapshots && selectedId ? snapshots.find((s) => s.id === selectedId) ?? null : null),
    [snapshots, selectedId],
  );

  const diffHunks = useMemo(() => {
    if (!selected) return [];
    // Placeholders aren't real profile content; skip the diff so the right
    // pane just shows the current profile plain.
    if (selected.source_type === "backfill_unrecovered" && selected.profile_version === 0) {
      return currentProfile ? [{ value: currentProfile, added: false, removed: false }] : [];
    }
    return diffLines(selected.profile_markdown || "", currentProfile || "");
  }, [selected, currentProfile]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:max-h-[85vh]"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <h2 className="font-handwritten text-xl tracking-tight text-stone-800">
                  Profile edit history
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Select a version on the left to compare it against the current profile.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left: timeline */}
              <div className="w-64 shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-50/60">
                {loading && (
                  <div className="px-4 py-4 text-xs text-stone-500">Loading…</div>
                )}
                {error && (
                  <div className="px-4 py-4 text-xs text-red-600">{error}</div>
                )}
                {snapshots && snapshots.length === 0 && (
                  <div className="px-4 py-4 text-xs text-stone-500">
                    No edits yet. Your agent&rsquo;s profile history will appear here as it evolves.
                  </div>
                )}
                {snapshots && snapshots.length > 0 && (
                  <ul className="divide-y divide-stone-200">
                    {snapshots.map((s) => {
                      const isPlaceholder = s.source_type === "backfill_unrecovered" && s.profile_version === 0;
                      const meta = isPlaceholder
                        ? { label: "Earlier edits", icon: "🗓️" }
                        : TRIGGER_META[s.trigger];
                      const isSelected = s.id === selectedId;
                      const href = sourceHref(s);
                      return (
                        <li key={s.id}>
                          <button
                            onClick={() => setSelectedId(s.id)}
                            className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                              isSelected ? "bg-white" : "hover:bg-white/60"
                            }`}
                          >
                            <div className="flex items-center gap-2 text-xs">
                              <span aria-hidden>{meta?.icon ?? "•"}</span>
                              <span className="font-medium text-stone-800">
                                {meta?.label ?? s.trigger}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-stone-500">
                              <span>{isPlaceholder ? "" : `v${s.profile_version}`}</span>
                              <span>{timeAgo(s.created_at)}</span>
                            </div>
                            {href && (
                              <a
                                href={href}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline"
                              >
                                View source →
                              </a>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Right: diff */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!selected && !loading && (
                  <div className="px-6 py-10 text-center text-sm text-stone-500">
                    Select a version on the left to see what changed.
                  </div>
                )}
                {selected && (
                  <DiffPanes
                    snapshot={selected}
                    currentProfile={currentProfile}
                    diffHunks={diffHunks}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
