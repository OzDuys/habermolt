"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Deliberation {
  id: string;
  question: string;
  stage: string;
  num_citizens: number;
  created_at: string;
}

interface Trace {
  id: string;
  trace_type: string;
  status: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  error_message: string | null;
  agent_id: string | null;
  created_at: string;
}

function getSecret() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("monitoring_secret") || "";
}

function DeliberationRow({ d }: { d: Deliberation }) {
  const [expanded, setExpanded] = useState(false);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loadingTraces, setLoadingTraces] = useState(false);
  const [tracesFetched, setTracesFetched] = useState(false);

  const fetchTraces = useCallback(async () => {
    if (tracesFetched) return;
    setLoadingTraces(true);
    try {
      const params = new URLSearchParams({ deliberation_id: d.id, page_size: "100" });
      const res = await fetch(`/api/backend/monitoring/traces?${params}`, {
        headers: { "X-Monitoring-Secret": getSecret() },
      });
      const data = await res.json();
      setTraces(data.traces || []);
      setTracesFetched(true);
    } catch {
      setTraces([]);
    } finally {
      setLoadingTraces(false);
    }
  }, [d.id, tracesFetched]);

  const handleToggle = () => {
    if (!expanded && !tracesFetched) {
      fetchTraces();
    }
    setExpanded(!expanded);
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href={`/monitoring/deliberations/${d.id}`}
            className="font-bold text-sm leading-snug hover:opacity-70 flex-1"
          >
            {d.question}
          </Link>
          <div className="flex flex-col gap-1 shrink-0 items-end sm:flex-row sm:items-center sm:gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 whitespace-nowrap">
              {d.stage}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700 whitespace-nowrap">
              continuous
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {d.num_citizens} participants · {new Date(d.created_at).toLocaleDateString()}
          </div>
          <button
            onClick={handleToggle}
            className="text-xs font-medium hover:opacity-70 transition-opacity shrink-0"
            style={{ color: "var(--muted)" }}
          >
            {expanded ? "Hide traces ↑" : "Show traces ↓"}
          </button>
        </div>
      </div>

      {/* Traces section */}
      {expanded && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {loadingTraces ? (
            <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
              Loading traces...
            </div>
          ) : traces.length === 0 ? (
            <div className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
              No traces for this deliberation
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--background)" }}>
                    <TH>Type</TH>
                    <TH>Model</TH>
                    <TH>Status</TH>
                    <TH>Tokens</TH>
                    <TH>Latency</TH>
                    <TH>Time</TH>
                    <TH></TH>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-3 py-2 font-mono">{t.trace_type}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate">{t.model}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === "error"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {t.tokens_in != null && t.tokens_out != null
                          ? (t.tokens_in + t.tokens_out).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {t.latency_ms != null ? `${t.latency_ms.toLocaleString()}ms` : "—"}
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--muted)" }}>
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/monitoring/traces/${t.id}`}
                          className="font-medium hover:opacity-70"
                          style={{ color: "var(--foreground)" }}
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tracesFetched && (
            <div
              className="px-4 py-2 text-xs flex items-center justify-between border-t"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              <span>{traces.length} trace{traces.length !== 1 ? "s" : ""}</span>
              <Link
                href={`/monitoring/traces?deliberation_id=${d.id}`}
                className="hover:opacity-70"
                style={{ color: "var(--muted)" }}
              >
                Open in traces browser →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </th>
  );
}

export default function DeliberationsDebugPage() {
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backend/deliberations")
      .then((r) => r.json())
      .then((data) => setDeliberations(data.deliberations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        Loading...
      </div>
    );

  return (
    <div className="w-full max-w-5xl">
      <h1 className="text-xl font-bold mb-4 sm:text-2xl sm:mb-6">Deliberations Debug</h1>

      {deliberations.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          No deliberations found
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {deliberations.map((d) => (
            <DeliberationRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}
