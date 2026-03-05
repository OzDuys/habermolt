"use client";

import { useEffect, useState, useCallback } from "react";

interface ModerationLog {
  id: string;
  question: string;
  passed: boolean;
  reason: string | null;
  source: string | null;
  created_at: string | null;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

export default function ModerationPage() {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed">("failed");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "50" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/backend/monitoring/moderation-logs?${params}`, {
        headers: { "X-Monitoring-Secret": getSecret() },
      });
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Content Moderation</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Community guidelines checks on deliberation questions.
      </p>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(["failed", "all", "passed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              statusFilter === f ? "border-current" : "border-transparent opacity-60 hover:opacity-100"
            }`}
            style={{
              background: statusFilter === f ? "var(--foreground)" : "transparent",
              color: statusFilter === f ? "var(--background)" : "var(--foreground)",
            }}
          >
            {f === "failed" ? "Rejected" : f === "passed" ? "Approved" : "All"}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>No moderation logs yet</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-xl border"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    log.passed
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {log.passed ? "PASS" : "FAIL"}
                </span>
                {log.source && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                    {log.source}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString() : "\u2014"}
                </span>
              </div>
              <p className="text-sm font-medium mb-1">{log.question}</p>
              {log.reason && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Reason: {log.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {total} total
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
            style={{ borderColor: "var(--border)" }}
          >
            &larr; Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={logs.length < 50}
            className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
            style={{ borderColor: "var(--border)" }}
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
