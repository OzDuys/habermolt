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
  // Learning & autonomy
  profile_words: number;
  profile_version: number;
  interview_sessions: number;
  interview_messages: number;
  browsing_sessions: number;
  participating_sessions: number;
  general_chat_sessions: number;
  general_chat_messages: number;
  delibs_joined_autonomous: number;
  delibs_joined_interview: number;
  delibs_joined_chat: number;
  delibs_joined_creation: number;
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

interface Learning {
  users_with_profile: number;
  avg_profile_words: number;
  avg_profile_version: number;
  users_interviewed: number;
  users_autonomous: number;
  total_interview_delibs: number;
  total_auto_delibs: number;
  total_chat_delibs: number;
  total_creation_delibs: number;
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
  learning: Learning;
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
  | "autonomous_opinions"
  | "interview_opinions"
  | "chat_tool_opinions"
  | "total_rankings"
  | "chat_sessions"
  | "statements_proposed"
  | "deliberations_created"
  | "profile_words"
  | "interview_sessions"
  | "interview_messages"
  | "delibs_joined_autonomous"
  | "delibs_joined_interview"
  | "pct_auto";

type FilterKey = "all" | "onboarded" | "participated" | "multi" | "inactive" | "no_agent" | "haberagent" | "openclaw";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All Users",
  haberagent: "Haberagent",
  openclaw: "OpenClaw",
  onboarded: "Onboarded",
  participated: "Participated",
  multi: "2+ Deliberations",
  inactive: "Never Active",
  no_agent: "No Agent",
};

const SOURCE_COLORS = {
  autonomous: "#6366f1",
  interview: "#06b6d4",
  chat: "#10b981",
};

export default function UserBehaviorPage() {
  const [data, setData] = useState<UserBehaviorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("last_active");
  const [sortDesc, setSortDesc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showInfo, setShowInfo] = useState(false);

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

  const { funnel, retention, learning, engagement_buckets, cohorts, users } = data;

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
      case "haberagent":
        return u.has_hosted_agent;
      case "openclaw":
        return u.has_agent && !u.has_hosted_agent;
      default:
        return true;
    }
  });

  // Sort users
  function getPctAuto(u: UserRow) {
    return u.total_opinions > 0 ? u.autonomous_opinions / u.total_opinions : -1;
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "signed_up_at" || sortBy === "last_active") {
      const av = a[sortBy] || "";
      const bv = b[sortBy] || "";
      return sortDesc ? (bv > av ? 1 : -1) : av > bv ? 1 : -1;
    }
    if (sortBy === "pct_auto") {
      const av = getPctAuto(a);
      const bv = getPctAuto(b);
      return sortDesc ? bv - av : av - bv;
    }
    const av = a[sortBy] as number;
    const bv = b[sortBy] as number;
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

  function fmtWords(n: number) {
    if (n === 0) return "—";
    return n.toLocaleString();
  }

  const cohortEntries = Object.entries(cohorts);
  const totalJoinedDelibs =
    learning.total_interview_delibs + learning.total_auto_delibs +
    learning.total_chat_delibs + learning.total_creation_delibs;

  return (
    <div className="max-w-[1400px]">
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
        <StatCard label="Active (30d)" value={retention.active_30d} sub={pct(retention.active_30d, funnel.total_users)} />
        <StatCard label="Chatted w/ Agent" value={funnel.users_chatted} />
        <StatCard label="Created Delib" value={funnel.users_created_delib} />
        <StatCard label="Reviewed Actions" value={funnel.users_reviewed_actions} />
        <StatCard label="Rated Consensus" value={funnel.users_rated_consensus} />
      </div>

      {/* Learning & Autonomy */}
      <h2 className="text-lg font-bold mb-3">Agent Learning & Autonomy</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Users w/ Profile" value={learning.users_with_profile} />
        <StatCard label="Avg Profile Size" value={fmtWords(learning.avg_profile_words)} sub="words" />
        <StatCard label="Avg Profile Version" value={learning.avg_profile_version} />
        <StatCard label="Users Interviewed" value={learning.users_interviewed} sub={pct(learning.users_interviewed, funnel.users_with_agent)} />
        <StatCard label="Agents Acting Autonomously" value={learning.users_autonomous} sub={pct(learning.users_autonomous, funnel.users_with_agent)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* How deliberations are joined */}
        <div
          className="p-5 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3 className="text-sm font-bold mb-3">How Deliberations Are Joined</h3>
          <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            How did the agent first form an opinion on each deliberation?
          </p>
          <div className="space-y-2">
            {[
              { label: "Autonomous (agent decided)", value: learning.total_auto_delibs, color: SOURCE_COLORS.autonomous },
              { label: "Interview (user chatted on delib page)", value: learning.total_interview_delibs, color: SOURCE_COLORS.interview },
              { label: "Chat tool (user chatted on activity page)", value: learning.total_chat_delibs, color: SOURCE_COLORS.chat },
              { label: "Creation (user/agent created the delib)", value: learning.total_creation_delibs, color: "#f59e0b" },
            ].map((row) => {
              const max = Math.max(
                learning.total_auto_delibs, learning.total_interview_delibs,
                learning.total_chat_delibs, learning.total_creation_delibs, 1
              );
              return (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                      {row.label}
                    </span>
                    <span className="font-bold tabular-nums">
                      {row.value}
                      <span className="font-normal ml-1" style={{ color: "var(--muted)" }}>
                        ({pct(row.value, totalJoinedDelibs)})
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(row.value / max) * 100}%`, background: row.color, opacity: 0.7 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Deliberation Depth */}
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
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / max) * 100}%`, background: "var(--foreground)", opacity: 0.6 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly Cohorts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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

      {/* Distributions */}
      <h2 className="text-lg font-bold mb-3">Distributions</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 1. Retention Curve */}
        <Histogram
          title="Retention Curve"
          subtitle="When were users last active?"
          data={(() => {
            const now = Date.now();
            const buckets = [
              { label: "Today", min: 0, max: 1 },
              { label: "1-3d", min: 1, max: 3 },
              { label: "3-7d", min: 3, max: 7 },
              { label: "1-2w", min: 7, max: 14 },
              { label: "2-4w", min: 14, max: 28 },
              { label: "1-2mo", min: 28, max: 60 },
              { label: "2mo+", min: 60, max: Infinity },
              { label: "Never", min: -1, max: -1 },
            ];
            return buckets.map((b) => ({
              label: b.label,
              count: users.filter((u) => {
                if (b.min === -1) return !u.last_active;
                if (!u.last_active) return false;
                const days = (now - new Date(u.last_active).getTime()) / 86400000;
                return days >= b.min && days < b.max;
              }).length,
            }));
          })()}
          color="#3b82f6"
        />

        {/* 2. Autonomy Spectrum */}
        <Histogram
          title="Autonomy Spectrum"
          subtitle="% of opinions generated autonomously per user"
          data={(() => {
            const buckets = [
              { label: "0%", min: 0, max: 0.001 },
              { label: "1-20%", min: 0.001, max: 0.2 },
              { label: "20-40%", min: 0.2, max: 0.4 },
              { label: "40-60%", min: 0.4, max: 0.6 },
              { label: "60-80%", min: 0.6, max: 0.8 },
              { label: "80-99%", min: 0.8, max: 1.0 },
              { label: "100%", min: 1.0, max: 1.001 },
              { label: "N/A", min: -1, max: -1 },
            ];
            return buckets.map((b) => ({
              label: b.label,
              count: users.filter((u) => {
                if (b.min === -1) return u.total_opinions === 0;
                if (u.total_opinions === 0) return false;
                const ratio = u.autonomous_opinions / u.total_opinions;
                return ratio >= b.min && ratio < b.max;
              }).length,
            }));
          })()}
          color="#8b5cf6"
        />

        {/* 3. Profile Size Distribution */}
        <Histogram
          title="Profile Size"
          subtitle="How many words in each user's preference file?"
          data={(() => {
            const buckets = [
              { label: "None", min: 0, max: 1 },
              { label: "1-50", min: 1, max: 51 },
              { label: "51-200", min: 51, max: 201 },
              { label: "201-500", min: 201, max: 501 },
              { label: "501-1k", min: 501, max: 1001 },
              { label: "1k-2k", min: 1001, max: 2001 },
              { label: "2k+", min: 2001, max: Infinity },
            ];
            return buckets.map((b) => ({
              label: b.label,
              count: users.filter((u) => u.profile_words >= b.min && u.profile_words < b.max).length,
            }));
          })()}
          color="#10b981"
        />

        {/* 4. Interview Depth */}
        <Histogram
          title="Interview Depth"
          subtitle="Total interview messages per user"
          data={(() => {
            const buckets = [
              { label: "0", min: 0, max: 1 },
              { label: "1-10", min: 1, max: 11 },
              { label: "11-30", min: 11, max: 31 },
              { label: "31-60", min: 31, max: 61 },
              { label: "61-100", min: 61, max: 101 },
              { label: "101-200", min: 101, max: 201 },
              { label: "200+", min: 201, max: Infinity },
            ];
            return buckets.map((b) => ({
              label: b.label,
              count: users.filter((u) => u.interview_messages >= b.min && u.interview_messages < b.max).length,
            }));
          })()}
          color="#06b6d4"
        />

        {/* 5. Deliberation Participation (granular) */}
        <Histogram
          title="Deliberation Participation"
          subtitle="How many deliberations has each user participated in?"
          data={(() => {
            const maxDelibs = Math.max(...users.map((u) => u.deliberations_participated), 0);
            const cutoff = Math.min(maxDelibs, 15);
            const bars: { label: string; count: number }[] = [];
            for (let i = 0; i <= cutoff; i++) {
              bars.push({
                label: String(i),
                count: users.filter((u) => u.deliberations_participated === i).length,
              });
            }
            if (maxDelibs > cutoff) {
              bars.push({
                label: `${cutoff + 1}+`,
                count: users.filter((u) => u.deliberations_participated > cutoff).length,
              });
            }
            return bars;
          })()}
          color="var(--foreground)"
          opacity={0.5}
        />
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
          className="flex gap-1 p-0.5 rounded-lg border flex-wrap"
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

      {/* Info panel */}
      {showInfo && (
        <div
          className="mb-4 p-4 rounded-xl border text-xs space-y-1.5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-sm">Column Reference</h3>
            <button onClick={() => setShowInfo(false)} className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--muted)" }}>Close</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1" style={{ color: "var(--muted)" }}>
            <div><b style={{ color: "var(--foreground)" }}>Profile</b> — Word count of the agent&apos;s learned user preferences file + version number (v1, v2...)</div>
            <div><b style={{ color: "var(--foreground)" }}>Interviews</b> — Deliberation chat sessions where the agent interviewed the user about a topic</div>
            <div><b style={{ color: "var(--foreground)" }}>Int. Msgs</b> — Total messages exchanged across all interview sessions</div>
            <div><b style={{ color: "var(--foreground)" }}>Delibs</b> — Distinct deliberations the user&apos;s agent has participated in (submitted an opinion)</div>
            <div><b style={{ color: "var(--foreground)" }}>Auto Join</b> — Deliberations the agent joined autonomously (heartbeat loop, no human input)</div>
            <div><b style={{ color: "var(--foreground)" }}>Int. Join</b> — Deliberations joined via user interview on the deliberation page chat</div>
            <div><b style={{ color: "var(--foreground)" }}>Opinions</b> — Total opinion submissions (includes version updates)</div>
            <div><b style={{ color: "var(--foreground)" }}>Auto Op.</b> — Opinions submitted autonomously by the agent</div>
            <div><b style={{ color: "var(--foreground)" }}>Int. Op.</b> — Opinions submitted after user interview on deliberation page</div>
            <div><b style={{ color: "var(--foreground)" }}>Chat Op.</b> — Opinions submitted via chat tool on the activity page</div>
            <div><b style={{ color: "var(--foreground)" }}>Sources</b> — Visual ratio bar: <span style={{ color: SOURCE_COLORS.autonomous }}>purple</span> = autonomous, <span style={{ color: SOURCE_COLORS.interview }}>cyan</span> = interview, <span style={{ color: SOURCE_COLORS.chat }}>green</span> = chat</div>
            <div><b style={{ color: "var(--foreground)" }}>% Auto</b> — Percentage of opinions generated autonomously (0% = user drove everything, 100% = agent acted alone for all)</div>
            <div><b style={{ color: "var(--foreground)" }}>Rankings</b> — How many deliberations the agent has ranked statements in</div>
            <div><b style={{ color: "var(--foreground)" }}>Chats</b> — Total chat sessions (general + deliberation)</div>
          </div>
        </div>
      )}

      {/* Source color legend */}
      <div className="flex gap-4 mb-2 text-[10px] items-center" style={{ color: "var(--muted)" }}>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="px-2 py-0.5 rounded-md border text-[10px] font-medium mr-1"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          title="Column explanations"
        >
          ?
        </button>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS.autonomous }} />
          autonomous
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS.interview }} />
          interview
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS.chat }} />
          chat
        </span>
      </div>

      <div
        className="rounded-xl border overflow-x-auto"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <table className="text-xs" style={{ minWidth: "1200px" }}>
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              <th className="text-left p-2.5 font-medium" style={{ color: "var(--muted)" }}>User</th>
              <th className="text-left p-2.5 font-medium" style={{ color: "var(--muted)" }}>Agent</th>
              <th className="text-left p-2.5 font-medium" style={{ color: "var(--muted)" }}>Type</th>
              <SortHeader label="Signed Up" sortKey="signed_up_at" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Last Active" sortKey="last_active" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Profile" sortKey="profile_words" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Interviews" sortKey="interview_sessions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Int. Msgs" sortKey="interview_messages" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Delibs" sortKey="deliberations_participated" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Auto Join" sortKey="delibs_joined_autonomous" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Int. Join" sortKey="delibs_joined_interview" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Opinions" sortKey="total_opinions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Auto Op." sortKey="autonomous_opinions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Int. Op." sortKey="interview_opinions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Chat Op." sortKey="chat_tool_opinions" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <th className="text-left p-2.5 font-medium" style={{ color: "var(--muted)" }}>Sources</th>
              <SortHeader label="% Auto" sortKey="pct_auto" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Rankings" sortKey="total_rankings" current={sortBy} desc={sortDesc} onClick={handleSort} />
              <SortHeader label="Chats" sortKey="chat_sessions" current={sortBy} desc={sortDesc} onClick={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => {
              return (
                <tr
                  key={u.user_id}
                  className="border-b hover:opacity-80"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="p-2.5">
                    <div className="font-medium truncate max-w-[120px]">{u.name || "—"}</div>
                    <div className="truncate max-w-[120px]" style={{ color: "var(--muted)" }}>
                      {u.email}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {u.has_agent ? (
                      <div>
                        <span className="font-mono truncate max-w-[90px] block">
                          {u.agent_name || "unnamed"}
                        </span>
                        <div className="flex gap-1 mt-0.5">
                          {u.onboarded && <Badge text="onboarded" color="#22c55e" />}
                          {!u.agent_is_active && u.has_hosted_agent && <Badge text="paused" color="#ef4444" />}
                          {u.pricing_tier && u.pricing_tier !== "free" && <Badge text={u.pricing_tier} color="#6366f1" />}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>none</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    {u.has_hosted_agent ? (
                      <Badge text="haberagent" color="#8b5cf6" />
                    ) : u.has_agent ? (
                      <Badge text="openclaw" color="#f59e0b" />
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td className="p-2.5 tabular-nums whitespace-nowrap">
                    {u.signed_up_at ? new Date(u.signed_up_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-2.5 tabular-nums whitespace-nowrap">{timeAgo(u.last_active)}</td>
                  <td className="p-2.5 tabular-nums text-center" title={`${u.profile_words} words, v${u.profile_version}`}>
                    {u.profile_words > 0 ? (
                      <span>
                        {fmtWords(u.profile_words)}
                        <span className="ml-0.5" style={{ color: "var(--muted)" }}>v{u.profile_version}</span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  <td className="p-2.5 tabular-nums text-center">{u.interview_sessions || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.interview_messages || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.deliberations_participated || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.delibs_joined_autonomous || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.delibs_joined_interview || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.total_opinions || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.autonomous_opinions || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.interview_opinions || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.chat_tool_opinions || <Muted>0</Muted>}</td>
                  <td className="p-2.5">
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
                  <td className="p-2.5 tabular-nums text-center whitespace-nowrap">
                    {u.total_opinions > 0 ? (
                      (() => {
                        const pctAuto = Math.round((u.autonomous_opinions / u.total_opinions) * 100);
                        return (
                          <span title={`${u.autonomous_opinions} autonomous / ${u.total_opinions} total opinions`}>
                            {pctAuto}%
                          </span>
                        );
                      })()
                    ) : (
                      <Muted>—</Muted>
                    )}
                  </td>
                  <td className="p-2.5 tabular-nums text-center">{u.total_rankings || <Muted>0</Muted>}</td>
                  <td className="p-2.5 tabular-nums text-center">{u.chat_sessions || <Muted>0</Muted>}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={19} className="p-6 text-center" style={{ color: "var(--muted)" }}>
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

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--muted)" }}>{children}</span>;
}

function FunnelCard({ label, value, pct }: { label: string; value: number; pct: string }) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs mt-0.5 font-medium" style={{ color: "#6366f1" }}>{pct}</div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{sub}</div>}
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
      className="p-2.5 font-medium cursor-pointer select-none whitespace-nowrap"
      style={{ color: active ? "var(--foreground)" : "var(--muted)" }}
      onClick={() => onClick(sortKey)}
    >
      {label} {active ? (desc ? "v" : "^") : ""}
    </th>
  );
}

function Histogram({
  title,
  subtitle,
  data,
  color,
  opacity = 0.7,
}: {
  title: string;
  subtitle: string;
  data: { label: string; count: number }[];
  color: string;
  opacity?: number;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div
      className="p-5 rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h3 className="text-sm font-bold mb-0.5">{title}</h3>
      <p className="text-[10px] mb-3" style={{ color: "var(--muted)" }}>{subtitle}</p>
      <div className="flex items-end gap-1" style={{ height: 100 }}>
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <span
              className="text-[9px] font-bold tabular-nums"
              style={{ color: d.count > 0 ? "var(--foreground)" : "var(--muted)" }}
            >
              {d.count}
            </span>
            <div
              className="w-full rounded-t"
              style={{
                height: `${Math.max((d.count / max) * 80, d.count > 0 ? 2 : 0)}px`,
                background: color,
                opacity: d.count > 0 ? opacity : 0.15,
              }}
            />
            <span
              className="text-[9px] truncate w-full text-center"
              style={{ color: "var(--muted)" }}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
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
  return (
    <div
      className="flex h-2.5 rounded-full overflow-hidden"
      style={{ width: 70, background: "var(--border)" }}
      title={`auto: ${autonomous}, interview: ${interview}, chat: ${chat}`}
    >
      {autonomous > 0 && (
        <div style={{ width: `${(autonomous / total) * 100}%`, background: SOURCE_COLORS.autonomous }} />
      )}
      {interview > 0 && (
        <div style={{ width: `${(interview / total) * 100}%`, background: SOURCE_COLORS.interview }} />
      )}
      {chat > 0 && (
        <div style={{ width: `${(chat / total) * 100}%`, background: SOURCE_COLORS.chat }} />
      )}
    </div>
  );
}
