"use client";

import { useEffect, useState } from "react";

interface TraceBreakdown {
  count: number;
  tokens: number;
}

interface AgentUsage {
  id: string;
  display_name: string;
  pricing_tier: string;
  is_active: boolean;
  paused_reason: string | null;
  tokens_used_period: number;
  token_limit: number | null;
  trace_total: number;
  drift: number;
  billing_period_start: string;
  breakdown: Record<string, TraceBreakdown>;
  duplicate_heartbeats: number;
  total_heartbeats: number;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

const TRACE_COLORS: Record<string, string> = {
  hosted_agent_heartbeat: "#6366f1",
  hosted_agent_ranking: "#8b5cf6",
  hosted_agent_opinion: "#06b6d4",
  hosted_agent_statement: "#f59e0b",
  hosted_agent_chat: "#10b981",
  hosted_agent_correction: "#f97316",
  deliberation_chat: "#14b8a6",
  deliberation_chat_greeting: "#a3e635",
  deliberation_chat_ranking: "#e879f9",
  deliberation_chat_statement: "#fb923c",
  profile_update_from_approval: "#94a3b8",
};

function shortType(t: string) {
  return t
    .replace("hosted_agent_", "")
    .replace("deliberation_chat_", "d.chat/")
    .replace("deliberation_chat", "d.chat")
    .replace("profile_update_from_approval", "profile_update");
}

export default function TokenUsagePage() {
  const [agents, setAgents] = useState<AgentUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"tokens" | "drift" | "dupes">("tokens");

  useEffect(() => {
    fetch("/api/backend/monitoring/token-usage", {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => r.json())
      .then((data) => setAgents(data.agents || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        Loading...
      </div>
    );

  const sorted = [...agents].sort((a, b) => {
    if (sortBy === "drift") return Math.abs(b.drift) - Math.abs(a.drift);
    if (sortBy === "dupes") return b.duplicate_heartbeats - a.duplicate_heartbeats;
    return b.tokens_used_period - a.tokens_used_period;
  });

  const totalTokens = agents.reduce((s, a) => s + a.tokens_used_period, 0);
  const totalTraces = agents.reduce((s, a) => s + a.trace_total, 0);
  const totalDupes = agents.reduce((s, a) => s + a.duplicate_heartbeats, 0);
  const totalHBs = agents.reduce((s, a) => s + a.total_heartbeats, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Token Usage</h1>

      {/* Summary */}
      <div
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: "Total tracked", value: totalTokens.toLocaleString() },
          { label: "Total in traces", value: totalTraces.toLocaleString() },
          { label: "Drift", value: (totalTokens - totalTraces).toLocaleString() },
          {
            label: "Dupe heartbeats",
            value: `${totalDupes} / ${totalHBs} (${totalHBs > 0 ? ((totalDupes / totalHBs) * 100).toFixed(0) : 0}%)`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              {s.label}
            </div>
            <div className="text-lg font-bold mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div className="mb-3 flex gap-2">
        {(["tokens", "drift", "dupes"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className="rounded-lg border px-2.5 py-1 text-xs transition-all"
            style={{
              borderColor: sortBy === s ? "var(--foreground)" : "var(--border)",
              background: sortBy === s ? "var(--foreground)" : "transparent",
              color: sortBy === s ? "var(--background)" : "var(--foreground)",
            }}
          >
            {s === "tokens" ? "By usage" : s === "drift" ? "By drift" : "By dupes"}
          </button>
        ))}
      </div>

      {/* Agent table */}
      <div className="space-y-2">
        {sorted.map((a) => {
          const pct = a.token_limit ? Math.min((a.tokens_used_period / a.token_limit) * 100, 100) : 0;
          const isNearLimit = pct >= 80;
          const breakdownEntries = Object.entries(a.breakdown).sort(
            ([, x], [, y]) => y.tokens - x.tokens
          );

          return (
            <div
              key={a.id}
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{a.display_name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: a.is_active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                      color: a.is_active ? "#10b981" : "#ef4444",
                    }}
                  >
                    {a.is_active ? "active" : a.paused_reason || "paused"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {a.pricing_tier}
                  </span>
                </div>
                <div className="text-right text-xs" style={{ color: "var(--muted)" }}>
                  {a.tokens_used_period.toLocaleString()}
                  {a.token_limit && ` / ${a.token_limit.toLocaleString()}`}
                  {a.token_limit && (
                    <span
                      className="ml-1 font-medium"
                      style={{ color: isNearLimit ? "#ef4444" : "var(--muted)" }}
                    >
                      ({pct.toFixed(0)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Usage bar */}
              {a.token_limit && (
                <div
                  className="flex h-1.5 w-full overflow-hidden rounded-full mb-2"
                  style={{ background: "var(--surface-dim, var(--border))" }}
                >
                  {breakdownEntries.map(([type, data]) => (
                    <div
                      key={type}
                      className="h-full"
                      title={`${shortType(type)}: ${data.tokens.toLocaleString()}`}
                      style={{
                        width: `${(data.tokens / a.token_limit!) * 100}%`,
                        background: TRACE_COLORS[type] || "#94a3b8",
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Breakdown + stats */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]" style={{ color: "var(--muted)" }}>
                {breakdownEntries.map(([type, data]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: TRACE_COLORS[type] || "#94a3b8" }}
                    />
                    {shortType(type)}: {(data.tokens / 1000).toFixed(0)}K ({data.count}x)
                  </span>
                ))}
              </div>

              {/* Warnings */}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {a.drift !== 0 && (
                  <span className="text-[10px] font-medium" style={{ color: a.drift > 0 ? "#f59e0b" : "#06b6d4" }}>
                    Drift: {a.drift > 0 ? "+" : ""}{a.drift.toLocaleString()} (tracked vs traces)
                  </span>
                )}
                {a.duplicate_heartbeats > 0 && (
                  <span className="text-[10px] font-medium" style={{ color: "#ef4444" }}>
                    {a.duplicate_heartbeats} dupe heartbeats / {a.total_heartbeats} total
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
