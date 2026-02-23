"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  total_agents: number;
  total_deliberations: number;
  total_opinions: number;
  total_statements: number;
  total_rankings: number;
  total_traces: number;
  total_errors: number;
  error_rate: number;
  total_tokens_in: number;
  total_tokens_out: number;
  avg_latency_ms: number;
  traces_by_type: Record<string, number>;
  traces_by_model: Record<string, number>;
  traces_24h: number;
  deliberations_by_stage: Record<string, number>;
  deliberations_by_mechanism: Record<string, number>;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

export default function MonitoringDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/monitoring/stats", {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!stats) return <ErrorMsg message="No data" />;

  const totalTokens = stats.total_tokens_in + stats.total_tokens_out;
  const estimatedCost = (totalTokens / 1_000_000) * 0.5;

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Platform Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <StatCard label="Agents" value={stats.total_agents} />
        <StatCard label="Deliberations" value={stats.total_deliberations} />
        <StatCard label="Opinions" value={stats.total_opinions} />
        <StatCard label="Statements" value={stats.total_statements} />
        <StatCard label="Rankings" value={stats.total_rankings} />
      </div>

      {/* LLM Stats */}
      <h2 className="text-lg font-bold mb-3">LLM Usage</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Total Traces" value={stats.total_traces} />
        <StatCard label="Last 24h" value={stats.traces_24h} />
        <StatCard
          label="Error Rate"
          value={`${(stats.error_rate * 100).toFixed(1)}%`}
          sub={`${stats.total_errors} errors`}
          alert={stats.error_rate > 0.05}
        />
        <StatCard label="Avg Latency" value={`${stats.avg_latency_ms.toFixed(0)}ms`} />
        <StatCard
          label="Tokens"
          value={totalTokens > 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(1)}M` : totalTokens.toLocaleString()}
          sub={`${stats.total_tokens_in.toLocaleString()} in / ${stats.total_tokens_out.toLocaleString()} out`}
        />
        <StatCard label="Est. Cost" value={`$${estimatedCost.toFixed(2)}`} sub="@ $0.50/1M tokens" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Traces by Type */}
        <BreakdownCard title="Traces by Type" data={stats.traces_by_type} />

        {/* Traces by Model */}
        <BreakdownCard title="Traces by Model" data={stats.traces_by_model} />

        {/* Deliberations by Stage */}
        <BreakdownCard title="Deliberations by Stage" data={stats.deliberations_by_stage} />

        {/* Deliberations by Mechanism */}
        <BreakdownCard title="Deliberations by Mechanism" data={stats.deliberations_by_mechanism} />
      </div>

      {/* Quick Links */}
      <h2 className="text-lg font-bold mb-3">Quick Links</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink href="/monitoring/traces" label="Browse LLM Traces" />
        <QuickLink href="/monitoring/deliberations" label="Debug Deliberations" />
        <QuickLink href="/monitoring/database" label="Manage Database" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: number | string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: alert ? "var(--destructive, #ef4444)" : "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && (
        <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function BreakdownCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return (
      <div className="p-5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h3 className="text-sm font-bold mb-3">{title}</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>No data</p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.map(([key, count]) => (
          <div key={key}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="font-mono truncate mr-2">{key}</span>
              <span className="font-bold tabular-nums">{count.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${(count / max) * 100}%`, background: "var(--foreground)", opacity: 0.6 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="p-4 rounded-xl border text-sm font-medium transition-opacity hover:opacity-80"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {label} →
    </Link>
  );
}

function Loading() {
  return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
}

function ErrorMsg({ message }: { message: string }) {
  return <div className="text-sm text-red-500">Error: {message}</div>;
}
