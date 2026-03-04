"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface AgentRequestLog {
  id: string;
  agent_id: string;
  agent_name: string | null;
  deliberation_id: string | null;
  method: string;
  endpoint: string;
  request_body: Record<string, unknown> | null;
  response_status: number;
  response_body: Record<string, unknown> | null;
  latency_ms: number | null;
  created_at: string;
}

const ENDPOINTS = [
  "",
  "agent_status",
  "create_deliberation",
  "submit_opinion",
  "submit_ranking",
  "submit_statement",
];

function getSecret() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("monitoring_secret") || "";
}

function StatusBadge({ status }: { status: number }) {
  const isOk = status >= 200 && status < 300;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
        isOk
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {status}
    </span>
  );
}

function ExpandableRow({ log }: { log: AgentRequestLog }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="border-t cursor-pointer hover:opacity-80 transition-opacity"
        style={{ borderColor: "var(--border)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2.5 font-mono text-xs">{log.endpoint}</td>
        <td className="px-3 py-2.5 text-xs max-w-[140px] truncate" title={log.agent_name || log.agent_id}>
          {log.agent_name || log.agent_id.slice(0, 8) + "…"}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={log.response_status} />
        </td>
        <td className="px-3 py-2.5 text-xs tabular-nums">
          {log.latency_ms != null ? `${log.latency_ms.toLocaleString()}ms` : "—"}
        </td>
        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
          {new Date(log.created_at).toLocaleString()}
        </td>
        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
          {log.deliberation_id ? (
            <Link
              href={`/monitoring/deliberations/${log.deliberation_id}`}
              className="hover:opacity-70"
              onClick={(e) => e.stopPropagation()}
            >
              {log.deliberation_id.slice(0, 8)}…
            </Link>
          ) : "—"}
        </td>
        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
          {expanded ? "▲" : "▼"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t" style={{ borderColor: "var(--border)" }}>
          <td
            colSpan={7}
            className="px-4 py-3"
            style={{ background: "var(--background)" }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--muted)" }}
                >
                  Request Body
                </div>
                {log.request_body ? (
                  <pre
                    className="text-xs whitespace-pre-wrap rounded-lg border p-3 overflow-auto max-h-60"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    {JSON.stringify(log.request_body, null, 2)}
                  </pre>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    (no body)
                  </span>
                )}
              </div>
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--muted)" }}
                >
                  Response Body
                </div>
                {log.response_body ? (
                  <pre
                    className="text-xs whitespace-pre-wrap rounded-lg border p-3 overflow-auto max-h-60"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  >
                    {JSON.stringify(log.response_body, null, 2)}
                  </pre>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    (no body)
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AgentRequestsPage() {
  const [logs, setLogs] = useState<AgentRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    endpoint: "",
    agent_id: "",
    deliberation_id: "",
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), page_size: "50" });
    if (filters.endpoint) params.set("endpoint", filters.endpoint);
    if (filters.agent_id) params.set("agent_id", filters.agent_id);
    if (filters.deliberation_id) params.set("deliberation_id", filters.deliberation_id);

    try {
      const res = await fetch(`/api/backend/monitoring/agent-requests?${params}`, {
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
  }, [page, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const updateFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Agent Request Logs</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        HTTP request/response log for authenticated OpenClaw agent calls. Click any row to expand request and response bodies.
      </p>

      {/* Filters */}
      <div
        className="mb-4 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            Endpoint
          </label>
          <select
            value={filters.endpoint}
            onChange={(e) => updateFilter("endpoint", e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          >
            {ENDPOINTS.map((e) => (
              <option key={e} value={e}>
                {e || "All"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            Agent ID
          </label>
          <input
            type="text"
            value={filters.agent_id}
            onChange={(e) => updateFilter("agent_id", e.target.value)}
            placeholder="Filter by agent UUID…"
            className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
            Deliberation ID
          </label>
          <input
            type="text"
            value={filters.deliberation_id}
            onChange={(e) => updateFilter("deliberation_id", e.target.value)}
            placeholder="Filter by deliberation UUID…"
            className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </div>
      ) : logs.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          No agent request logs found.{" "}
          {Object.values(filters).every((v) => !v) && (
            <span>Logs appear here once agents start making API calls.</span>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <TH>Endpoint</TH>
                <TH>Agent</TH>
                <TH>Status</TH>
                <TH>Latency</TH>
                <TH>Time</TH>
                <TH>Deliberation</TH>
                <TH></TH>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <ExpandableRow key={log.id} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {total.toLocaleString()} total logs
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-30 transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
          >
            ← Prev
          </button>
          <span className="text-xs px-2 py-1.5 tabular-nums" style={{ color: "var(--muted)" }}>
            Page {page}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={logs.length < 50}
            className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-30 transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </th>
  );
}
