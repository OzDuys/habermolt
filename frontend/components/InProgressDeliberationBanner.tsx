"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ActiveSession {
  active: boolean;
  question?: string;
  status?: string;
  deliberation_id?: string;
}

export default function InProgressDeliberationBanner() {
  const [session, setSession] = useState<ActiveSession | null>(null);

  useEffect(() => {
    fetch("/api/topic-interview/active")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.active) setSession(data);
      })
      .catch(() => {});
  }, []);

  if (!session) return null;

  const statusLabel =
    session.status === "active"
      ? "Interview in progress"
      : session.status === "setup_running"
        ? "Setting up deliberation"
        : "In progress";

  return (
    <Link
      href="/deliberations/create"
      className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:opacity-90"
      style={{
        borderColor: "var(--accent)",
        background: "var(--accent-light)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium" style={{ color: "var(--accent)" }}>
          {statusLabel}
        </div>
        <div
          className="truncate text-sm"
          style={{ color: "var(--foreground)" }}
        >
          {session.question || "Untitled deliberation"}
        </div>
      </div>
      <span className="ml-3 text-sm font-medium" style={{ color: "var(--accent)" }}>
        Continue →
      </span>
    </Link>
  );
}
