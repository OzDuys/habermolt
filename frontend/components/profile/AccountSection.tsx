"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function AccountSection({ session, onSignOut }: { session: { user: { name?: string | null; email: string; createdAt?: Date | string } }; onSignOut: () => void }) {
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(session.user.name || "");
  const [displayName, setDisplayName] = useState(session.user.name || "");
  const [savingName, setSavingName] = useState(false);

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === displayName) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await authClient.updateUser({ name: trimmed });
      await fetch("/api/backend/agents/me/human-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ human_name: trimmed }),
      });
      setDisplayName(trimmed);
      setEditingName(false);
    } catch {}
    finally { setSavingName(false); }
  };

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: "var(--foreground)" }}>Account</h3>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Username</span>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") { setEditingName(false); setNameValue(displayName); } }}
                className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                autoFocus
              />
              <button onClick={handleSaveName} disabled={savingName} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                {savingName ? "..." : "Save"}
              </button>
              <button onClick={() => { setEditingName(false); setNameValue(displayName); }} className="text-xs" style={{ color: "var(--muted)" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 self-start rounded-lg border px-2.5 py-1 text-sm font-medium transition-colors hover:border-stone-400 sm:self-auto" style={{ color: "var(--foreground)", borderColor: "var(--border)" }}>
              {displayName || "—"}
              <svg className="h-3 w-3" style={{ color: "var(--muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Email</span>
          <span className="truncate text-sm font-medium" style={{ color: "var(--foreground)" }}>{session.user.email}</span>
        </div>
        <div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Member since</span>
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {session.user.createdAt ? formatDate(new Date(session.user.createdAt).toISOString()) : "—"}
          </span>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={onSignOut}
          className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
