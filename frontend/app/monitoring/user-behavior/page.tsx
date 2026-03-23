"use client";

import { useEffect, useState } from "react";

interface UserRow {
  user_id: string;
  name: string;
  email: string;
  signed_up_at: string | null;
  has_agent: boolean;
  has_hosted_agent: boolean;
  agent_name: string | null;
  onboarded: boolean;
  agent_is_active: boolean;
  pricing_tier: string | null;
  last_active: string | null;
  deliberations_participated: number;
  deliberations_created: number;
  total_opinions: number;
  autonomous_opinions: number;
  interview_opinions: number;
  chat_tool_opinions: number;
  total_rankings: number;
  statements_proposed: number;
  chat_sessions: number;
  deliberation_chat_sessions: number;
  notifications_reviewed: number;
  notifications_total: number;
  consensus_ratings: number;
}

interface Funnel {
  total_users: number;
  users_with_agent: number;
  users_with_hosted_agent: number;
  users_onboarded: number;
  users_participated: number;
  users_multi_delib: number;
  users_created_delib: number;
  users_chatted: number;
  users_reviewed_actions: number;
  users_rated_consensus: number;
}

interface CohortData {
  signed_up: number;
  onboarded: number;
  participated: number;
  returned: number;
}

interface UserBehaviorData {
  funnel: Funnel;
  retention: { active_7d: number; active_30d: number };
  engagement_buckets: Record<string, number>;
  cohorts: Record<string, CohortData>;
  users: UserRow[];
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

type SortKey =
  | "signed_up_at"
  | "last_active"
  | "deliberations_participated"
  | "total_opinions"
  | "total_rankings"
  | "chat_sessions"
  | "statements_proposed"
  | "deliberations_created";

type FilterKey = "all" | "onboarded" | "participated" | "multi" | "inactive" | "no_agent";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All Users",
  onboarded: "Onboarded",
  participated: "Participated",
  multi: "2+ Deliberations",
  inactive: "Never Active",
  no_agent: "No Agent",
};

export default function UserBehaviorPage() {
  const [data, setData] = useState<UserBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("last_active");
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    fetch("/api/backend/monitoring/user-behavior", {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="text-sm text-red-500">Error: {error}</div>;
  if (!data)
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        Loading...
      </div>
    );

  const { funnel, retention, engagement_buckets, cohorts, users } = data;

  // Filter users
  const filtered = users.filter((u) => {
    switch (filter) {
      case "onboarded":
        return u.onboarded;
      case "participated":
        return u.deliberations_participated > 0;
      case "multi":
        return u.deliberations_participated > 1;
      case "inactive":
        return !u.last_active;
      case "no_agent":
        return !u.has_agent;
      default:
        return true;
    }
  });

  // Sort users
  const sorted = [...filtered].sort((a, b) => {
    let av: number | string | null, bv: number | string | null;
    if (sortBy === "signed_up_at" || sortBy === "last_active") {
      av = a[sortBy] || "";
      bv = b[sortBy] || "";
      return sortDesc ? (bv > av ? 1 : -1) : av > bv ? 1 : -1;
    }
    av = a[sortBy] as number;
    bv = b[sortBy] as number;
    return sortDesc ? bv - av : av - bv;
  });

  function handleSort(key: SortKey) {
    if (sortBy === key) setSortDesc(!sortDesc);
    else {
      setSortBy(key);
      setSortDesc(true);
    }
  }

  function pct(n: number, total: number) {
    if (total === 0) return "0%";
    return `${((n / total) * 100).toFixed(0)}%`;
  }

  function timeAgo(iso: string | null) {
    if (!iso) return "never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  const cohortEntries = Object.entries(cohorts);

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">User Behavior</h1>

      {loading && (
        <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Refreshing...
        </div>
      )}

      {/* Conversion Funnel */}
      <h2 className="text-lg font-bold mb-3">Conversion Funnel</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <FunnelCard label="Signed Up" value={funnel.total_users} pct="100%" />
        <FunnelCard
          label="Has Agent"
          value={funnel.users_with_agent}
          pct={pct(funnel.users_with_agent, funnel.total_users)}
        />
        <FunnelCard
          label="Onboarded"
          value={funnel.users_onboarded}
          pct={pct(funnel.users_onboarded, funnel.total_users)}
        />
        <FunnelCard
          label="Participated (1+)"
          value={funnel.users_participated}
          pct={pct(funnel.users_participated, funnel.total_users)}
        />
        <FunnelCard
          label="Multi-Delib (2+)"
          value={funnel.users_multi_delib}
          pct={pct(funnel.users_multi_delib, funnel.total_users)}
        />
      </div>

      {/* Engagement & Retention */}
      <h2 className="text-lg font-bold mb-3">Engagement & Retention</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <StatCard label="Active (7d)" value={retention.active_7d} sub={pct(retention.active_7d, funnel.total_users)} />
        <StatCard
          label="Active (30d)"
          value={retention.active_30d}
          sub={pct(retention.active_30d, funnel.total_users)}
        />
        <StatCard label="Chatted w/ Agent" value={funnel.users_chatted} />
        <StatCard label="Created Delib" value={funnel.users_created_delib} />
        <StatCard label="Reviewed Actions" value={funnel.users_reviewed_actions} />
        <StatCard label="Rated Consensus" value={funnel.users_rated_consensus} />
      </div>

      {/* Engagement Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div
          className="p-5 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3 className="text-sm font-bold mb-3">Deliberation Depth</h3>
          <div className="space-y-2">
            {Object.entries(engagement_buckets).map(([key, count]) => {
              const label = key.replace(/_/g, " ").replace("6 plus", "6+");
              const max = Math.max(...Object.values(engagement_buckets), 1);
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-mono">{label}</span>
                    <span className="font-bold tabular-nums">
                      {count}{" "}
                      <span style={{ color: "var(--muted)" }}>({pct(count, funnel.total_users)})</span>
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--border)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / max) * 100}%`,
                        background: "var(--foreground)",
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Cohorts */}
        <div
          className="p-5 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3 className="text-sm font-bold mb-3">Weekly Cohorts</h3>
          {cohortEntries.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>No data</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              <div className="flex text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>
                <span className="w-24 shrink-0">Week</span>
                <span className="w-16 text-right">Signup</span>
                <span className="w-16 text-right">Onboard</span>
                <span className="w-16 text-right">Active</span>
                <span className="w-16 text-right">Ret. 7d</span>
              </div>
              {cohortEntries.map(([week, c]) => (
                <div key={week} className="flex text-xs font-mono">
                  <span className="w-24 shrink-0 truncate">{week}</span>
                  <span className="w-16 text-right tabular-nums">{c.signed_up}</span>
                  <span className="w-16 text-right tabular-nums">{c.onboarded}</span>
                  <span className="w-16 text-right tabular-nums">{c.participated}</span>
                  <span className="w-16 text-right tabular-nums">{c.returned}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* User Table */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">
          Users{" "}
          <span className="text-sm font-normal" style={{ color: "var(--muted)" }}>
            ({filtered.length})
          </span>
        </h2>
        <div
          className="flex gap-1 p-0.5 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
        >
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
              style={{
                background: filter === f ? "var(--foreground)" : "transparent",
                color: filter === f ? "var(--background)" : "var(--muted)",
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>
                User
              </th>
              <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>
                Agent
              </th>
              <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>
                Type
              </th>
              <SortHeader label="Signed Up" sortKey="signed_up_at" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Last Active" sortKey="last_active" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Delibs" sortKey="deliberations_participated" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Opinions" sortKey="total_opinions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Rankings" sortKey="total_rankings" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Stmts" sortKey="statements_proposed" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Chats" sortKey="chat_sessions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>
                Opinion Sources
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr
                key={u.user_id}
                className="border-b hover:opacity-80"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="p-3">
                  <div className="font-medium truncate max-w-[140px]">{u.name || "—"}</div>
                  <div className="text-xs truncate max-w-[140px]" style={{ color: "var(--muted)" }}>
                    {u.email}
                  </div>
                </td>
                <td className="p-3">
                  {u.has_agent ? (
                    <div>
                      <span className="font-mono truncate max-w-[100px] block">
                        {u.agent_name || "unnamed"}
                      </span>
                      <div className="flex gap-1 mt-0.5">
                        {u.onboarded && <Badge text="onboarded" color="#22c55e" />}
                        {!u.agent_is_active && u.has_hosted_agent && (
                          <Badge text="paused" color="#ef4444" />
                        )}
                        {u.pricing_tier && u.pricing_tier !== "free" && (
                          <Badge text={u.pricing_tier} color="#6366f1" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>none</span>
                  )}
                </td>
                <td className="p-3">
                  {u.has_hosted_agent ? (
                    <Badge text="haberagent" color="#8b5cf6" />
                  ) : u.has_agent ? (
                    <Badge text="openclaw" color="#f59e0b" />
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td className="p-3 tabular-nums whitespace-nowrap">
                  {u.signed_up_at ? new Date(u.signed_up_at).toLocaleDateString() : "—"}
                </td>
                <td className="p-3 tabular-nums whitespace-nowrap">{timeAgo(u.last_active)}</td>
                <td className="p-3 tabular-nums text-center">{u.deliberations_participated}</td>
                <td className="p-3 tabular-nums text-center">{u.total_opinions}</td>
                <td className="p-3 tabular-nums text-center">{u.total_rankings}</td>
                <td className="p-3 tabular-nums text-center">{u.statements_proposed}</td>
                <td className="p-3 tabular-nums text-center">{u.chat_sessions}</td>
                <td className="p-3">
                  {u.total_opinions > 0 ? (
                    <SourceBar
                      autonomous={u.autonomous_opinions}
                      interview={u.interview_opinions}
                      chat={u.chat_tool_opinions}
                      total={u.total_opinions}
                    />
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center" style={{ color: "var(--muted)" }}>
                  No users match this filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Utility Components ── */

function FunnelCard({ label, value, pct }: { label: string; value: number; pct: string }) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs mt-0.5 font-medium" style={{ color: "#6366f1" }}>
        {pct}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
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

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: `${color}20`, color }}
    >
      {text}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  desc,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  desc: boolean;
  onClick: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="p-3 font-medium cursor-pointer select-none whitespace-nowrap"
      style={{ color: active ? "var(--foreground)" : "var(--muted)" }}
      onClick={() => onClick(sortKey)}
    >
      {label} {active ? (desc ? "v" : "^") : ""}
    </th>
  );
}

function SourceBar({
  autonomous,
  interview,
  chat,
  total,
}: {
  autonomous: number;
  interview: number;
  chat: number;
  total: number;
}) {
  const segments = [
    { value: autonomous, color: "#6366f1", label: "autonomous" },
    { value: interview, color: "#06b6d4", label: "interview" },
    { value: chat, color: "#10b981", label: "chat" },
  ].filter((s) => s.value > 0);

  return (
    <div className="space-y-1">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: s.color }}
          />
          <span className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>
            {s.value} {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
