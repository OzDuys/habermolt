"use client";

import { useEffect, useRef, useState } from "react";

interface HBBucket {
  date: string;
  total: number;
  dupes: number;
}

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
  const [hbBuckets, setHbBuckets] = useState<HBBucket[]>([]);
  const [hbDays, setHbDays] = useState<14 | 30 | 90>(30);

  useEffect(() => {
    fetch("/api/backend/monitoring/token-usage", {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => r.json())
      .then((data) => setAgents(data.agents || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`/api/backend/monitoring/heartbeat-timeseries?days=${hbDays}&granularity=day`, {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => r.json())
      .then((data) => setHbBuckets(data.buckets || []));
  }, [hbDays]);

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

      {/* Dupe heartbeats chart */}
      <DupeHeartbeatChart buckets={hbBuckets} days={hbDays} onDaysChange={setHbDays} />

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

function DupeHeartbeatChart({
  buckets,
  days,
  onDaysChange,
}: {
  buckets: HBBucket[];
  days: 14 | 30 | 90;
  onDaysChange: (d: 14 | 30 | 90) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; idx: number } | null>(null);

  const n = buckets.length;
  if (n === 0) return null;

  const W = 600;
  const H = 160;
  const PAD = { top: 12, right: 8, bottom: 24, left: 8 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const xScale = (i: number) => (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yScale = (v: number) => cH - (v / maxTotal) * cH;

  const totalLine = buckets
    .map((b, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(b.total).toFixed(1)}`)
    .join(" ");
  const dupeLine = buckets
    .map((b, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(b.dupes).toFixed(1)}`)
    .join(" ");
  const dupeArea =
    `M ${xScale(0).toFixed(1)} ${cH} ` +
    buckets.map((b, i) => `L ${xScale(i).toFixed(1)} ${yScale(b.dupes).toFixed(1)}`).join(" ") +
    ` L ${xScale(n - 1).toFixed(1)} ${cH} Z`;

  const tz = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const formatLabel = (d: string) => {
    const date = new Date(d + "T00:00:00Z");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
  };

  const labelStep = Math.max(1, Math.floor(n / 6));
  const xLabels: { idx: number; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    if (i % labelStep === 0 || i === n - 1) xLabels.push({ idx: i, label: formatLabel(buckets[i].date) });
  }
  if (xLabels.length >= 2) {
    const last = xLabels[xLabels.length - 1];
    const prev = xLabels[xLabels.length - 2];
    if (last.idx - prev.idx < labelStep * 0.5) xLabels.splice(xLabels.length - 2, 1);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
    const idx = Math.round(Math.max(0, Math.min(1, svgX / cW)) * (n - 1));
    setTooltip({ x: xScale(idx) + PAD.left, idx });
  }

  const totalSum = buckets.reduce((s, b) => s + b.total, 0);
  const dupeSum = buckets.reduce((s, b) => s + b.dupes, 0);

  return (
    <div className="mb-6 rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold">Duplicate Heartbeats Over Time</h3>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {dupeSum} dupes / {totalSum} total ({totalSum > 0 ? ((dupeSum / totalSum) * 100).toFixed(1) : 0}%)
          </p>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {([14, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
              style={{
                background: days === d ? "var(--foreground)" : "transparent",
                color: days === d ? "var(--background)" : "var(--muted)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mb-2 text-[10px]" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#6366f1" }} />
          Total heartbeats
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#ef4444" }} />
          Duplicates (&lt;60s apart)
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 160 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id="dupe-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            <path d={dupeArea} fill="url(#dupe-area-grad)" />
            <path d={totalLine} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
            <path d={dupeLine} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
            {xLabels.map(({ idx, label }) => (
              <text key={idx} x={xScale(idx)} y={cH + 16} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.4">
                {label}
              </text>
            ))}
            {tooltip && (
              <>
                <line x1={tooltip.x - PAD.left} y1={0} x2={tooltip.x - PAD.left} y2={cH} stroke="#6366f1" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
                <circle cx={tooltip.x - PAD.left} cy={yScale(buckets[tooltip.idx].total)} r="3" fill="#6366f1" />
                <circle cx={tooltip.x - PAD.left} cy={yScale(buckets[tooltip.idx].dupes)} r="3" fill="#ef4444" />
              </>
            )}
          </g>
        </svg>

        {tooltip && (
          <div
            className="absolute top-0 text-xs rounded-lg border px-2 py-1.5 pointer-events-none z-10"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              left: `${(tooltip.x / W) * 100}%`,
              transform: tooltip.x > W * 0.6 ? "translateX(-110%)" : "translateX(10%)",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ color: "var(--muted)" }}>{formatLabel(buckets[tooltip.idx].date)}</div>
            <div style={{ color: "#6366f1" }} className="font-bold">{buckets[tooltip.idx].total} heartbeats</div>
            <div style={{ color: "#ef4444" }} className="font-bold">{buckets[tooltip.idx].dupes} dupes</div>
          </div>
        )}
      </div>
    </div>
  );
}
