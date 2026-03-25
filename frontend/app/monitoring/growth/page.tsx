"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Bucket {
  date: string;
  new_users: number;
  new_agents: number;
  deliberations_created: number;
  opinions_total: number;
  agent_opinions: number;
  user_opinions: number;
  rankings: number;
  statements_proposed: number;
  llm_traces: number;
  tokens_used: number;
  cost: number;
  active_agents: number;
  llm_error_rate: number | null;
  consensus_changes: number;
  notifications_total: number;
  notifications_reviewed: number;
  notification_review_rate: number | null;
}

interface ComputedBucket extends Bucket {
  cumulative_users: number;
  cumulative_agents: number;
}

interface TimeseriesData {
  buckets: Bucket[];
  granularity: string;
  days: number;
  totals_at_start: { users: number; agents: number };
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

type Granularity = "hour" | "day" | "week";
type DaysRange = 1 | 7 | 14 | 30 | 90 | 180 | 365;

export default function GrowthPage() {
  const [data, setData] = useState<TimeseriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [days, setDays] = useState<DaysRange>(90);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/backend/monitoring/growth-timeseries?granularity=${granularity}&days=${days}`, {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [granularity, days]);

  const buckets = useMemo<ComputedBucket[]>(() => {
    if (!data) return [];
    let cumUsers = data.totals_at_start.users;
    let cumAgents = data.totals_at_start.agents;
    return data.buckets.map((b) => {
      cumUsers += b.new_users;
      cumAgents += b.new_agents;
      return { ...b, cumulative_users: cumUsers, cumulative_agents: cumAgents };
    });
  }, [data]);

  if (error) return <div className="text-sm text-red-500">Error: {error}</div>;
  if (!data) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Growth & Trends</h1>
        <div className="flex gap-2">
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {(["hour", "day", "week"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: granularity === g ? "var(--foreground)" : "transparent",
                  color: granularity === g ? "var(--background)" : "var(--muted)",
                }}
              >
                {g === "hour" ? "Hourly" : g === "day" ? "Daily" : "Weekly"}
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: "var(--border)" }}>
            {([1, 7, 14, 30, 90, 180, 365] as DaysRange[]).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: days === d ? "var(--foreground)" : "transparent",
                  color: days === d ? "var(--background)" : "var(--muted)",
                }}
              >
                {d === 365 ? "1y" : d === 180 ? "6m" : d === 90 ? "90d" : d === 30 ? "30d" : d === 14 ? "14d" : d === 7 ? "7d" : "1d"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>Refreshing...</div>}

      <div className="space-y-4">
        {/* ── Growth ── */}
        <SectionLabel>Growth</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard
            title="New Users"
            data={buckets}
            valueKey="new_users"
            color="#6366f1"
            granularity={granularity}
          />
          <ChartCard
            title="Cumulative Users"
            subtitle={`Started period at ${data.totals_at_start.users.toLocaleString()}`}
            data={buckets}
            valueKey="cumulative_users"
            color="#6366f1"
            granularity={granularity}
            showTotal={false}
            showLast
          />
          <ChartCard
            title="New Agents"
            data={buckets}
            valueKey="new_agents"
            color="#8b5cf6"
            granularity={granularity}
          />
          <ChartCard
            title="Cumulative Agents"
            subtitle={`Started period at ${data.totals_at_start.agents.toLocaleString()}`}
            data={buckets}
            valueKey="cumulative_agents"
            color="#8b5cf6"
            granularity={granularity}
            showTotal={false}
            showLast
          />
        </div>

        {/* ── Activity ── */}
        <SectionLabel>Activity</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard
            title="Active Agents"
            subtitle="Distinct agents with any opinion"
            data={buckets}
            valueKey="active_agents"
            color="#a855f7"
            granularity={granularity}
          />
          <ChartCard
            title="Deliberations Created"
            data={buckets}
            valueKey="deliberations_created"
            color="#06b6d4"
            granularity={granularity}
          />
          <ChartCard
            title="User Interactions"
            subtitle="Opinions via chat / interview"
            data={buckets}
            valueKey="user_opinions"
            color="#10b981"
            granularity={granularity}
          />
          <ChartCard
            title="Agent Interactions"
            subtitle="Autonomous + API opinions"
            data={buckets}
            valueKey="agent_opinions"
            color="#f59e0b"
            granularity={granularity}
          />
          <ChartCard
            title="Rankings Submitted"
            data={buckets}
            valueKey="rankings"
            color="#ec4899"
            granularity={granularity}
          />
          <ChartCard
            title="Statements Proposed"
            subtitle="Agent-contributed (non-seed)"
            data={buckets}
            valueKey="statements_proposed"
            color="#14b8a6"
            granularity={granularity}
          />
          <ChartCard
            title="Consensus Winner Changes"
            subtitle="Times the #1 winner was displaced"
            data={buckets}
            valueKey="consensus_changes"
            color="#f97316"
            granularity={granularity}
          />
        </div>

        {/* ── Engagement ── */}
        <SectionLabel>Engagement</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard
            title="Notification Review Rate"
            subtitle="% of agent actions reviewed by humans"
            data={buckets}
            valueKey="notification_review_rate"
            color="#0ea5e9"
            granularity={granularity}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            nullAs={0}
            yMax={1}
          />
          <ChartCard
            title="Notifications Sent"
            subtitle="Agent action notifications to users"
            data={buckets}
            valueKey="notifications_total"
            color="#0ea5e9"
            granularity={granularity}
          />
        </div>

        {/* ── LLM Usage & Cost ── */}
        <SectionLabel>LLM Usage & Cost</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChartCard
            title="Token Usage"
            data={buckets}
            valueKey="tokens_used"
            color="#3b82f6"
            granularity={granularity}
            format={(v) =>
              v >= 1_000_000
                ? `${(v / 1_000_000).toFixed(1)}M`
                : v >= 1_000
                ? `${(v / 1_000).toFixed(0)}k`
                : v.toLocaleString()
            }
          />
          <ChartCard
            title="LLM Cost"
            data={buckets}
            valueKey="cost"
            color="#d97706"
            granularity={granularity}
            format={(v) => `$${v.toFixed(3)}`}
          />
          <ChartCard
            title="LLM Error Rate"
            subtitle="Fraction of traces that errored"
            data={buckets}
            valueKey="llm_error_rate"
            color="#ef4444"
            granularity={granularity}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            nullAs={0}
            yMax={1}
          />
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: "var(--muted)" }}>
      {children}
    </h2>
  );
}

function ChartCard({
  title,
  subtitle,
  data,
  valueKey,
  color,
  granularity,
  format = (v: number) => v.toLocaleString(),
  nullAs,
  yMax,
  showTotal = true,
  showLast = false,
}: {
  title: string;
  subtitle?: string;
  data: ComputedBucket[];
  valueKey: keyof ComputedBucket;
  color: string;
  granularity: string;
  format?: (v: number) => string;
  nullAs?: number;
  yMax?: number;
  showTotal?: boolean;
  showLast?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rawValues = data.map((d) => {
    const v = d[valueKey];
    if (v === null || v === undefined) return nullAs ?? null;
    return v as number;
  });

  const values = rawValues.map((v) => v ?? 0);
  const total = values.reduce((s, v) => s + v, 0);
  const maxVal = yMax !== undefined ? yMax : Math.max(...values, 1);
  const n = data.length;

  const W = 500;
  const H = 130;
  const PAD = { top: 10, right: 8, bottom: 22, left: 8 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const xScale = (i: number) => (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yScale = (v: number) => cH - (v / maxVal) * cH;

  const linePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `M ${xScale(0).toFixed(1)} ${cH} ` +
    values.map((v, i) => `L ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(" ") +
    ` L ${xScale(n - 1).toFixed(1)} ${cH} Z`;

  // X-axis labels: ~5 evenly spaced
  const labelStep = Math.max(1, Math.floor(n / 5));
  const xLabels: { idx: number; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    if (i % labelStep === 0 || i === n - 1) {
      const rawDate = data[i].date;
      // Hourly buckets are formatted as "YYYY-MM-DDTHH:00", daily/weekly as "YYYY-MM-DD"
      const date = new Date(granularity === "hour" ? rawDate + ":00Z" : rawDate + "T00:00:00Z");
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const label =
        granularity === "hour"
          ? date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: tz })
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
      xLabels.push({ idx: i, label });
    }
  }
  // Remove last label if too close to second-to-last
  if (xLabels.length >= 2) {
    const last = xLabels[xLabels.length - 1];
    const prev = xLabels[xLabels.length - 2];
    if (last.idx - prev.idx < labelStep * 0.5) {
      xLabels.splice(xLabels.length - 2, 1);
    }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
    const ratio = Math.max(0, Math.min(1, svgX / cW));
    const idx = Math.round(ratio * (n - 1));
    setTooltip({
      x: xScale(idx) + PAD.left,
      y: yScale(values[idx]) + PAD.top,
      date: data[idx].date,
      value: values[idx],
    });
  }

  const gradId = `grad-${String(valueKey)}`;
  const lastValue = values[values.length - 1] ?? 0;

  return (
    <div className="p-5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        <span className="text-xs tabular-nums font-medium" style={{ color: "var(--muted)" }}>
          {showLast ? format(lastValue) : showTotal ? `${format(total)} total` : null}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 130 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.left}, ${PAD.top})`}>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />

            {xLabels.map(({ idx, label }) => (
              <text
                key={idx}
                x={xScale(idx)}
                y={cH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity="0.4"
                style={{ color: "var(--muted)" }}
              >
                {label}
              </text>
            ))}

            {tooltip && (
              <>
                <line
                  x1={tooltip.x - PAD.left}
                  y1={0}
                  x2={tooltip.x - PAD.left}
                  y2={cH}
                  stroke={color}
                  strokeWidth="1"
                  strokeDasharray="3,3"
                  opacity="0.5"
                />
                <circle cx={tooltip.x - PAD.left} cy={tooltip.y - PAD.top} r="3" fill={color} />
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
            <div style={{ color: "var(--muted)" }}>
              {granularity === "hour"
                ? new Date(tooltip.date + ":00Z").toLocaleString("en-US", {
                    month: "short", day: "numeric", hour: "numeric", hour12: true,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  })
                : tooltip.date}
            </div>
            <div className="font-bold" style={{ color }}>
              {format(tooltip.value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
