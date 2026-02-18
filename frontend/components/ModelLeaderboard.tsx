"use client";

import type { ModelLeaderboardEntry } from "@/lib/types";

interface ModelLeaderboardProps {
  entries: ModelLeaderboardEntry[];
  totalRounds: number;
  loading?: boolean;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--accent)", color: "var(--background)" }}>
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--border)", color: "var(--foreground)" }}>
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        3
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-semibold" style={{ color: "var(--muted)" }}>
      {rank}
    </span>
  );
}

export default function ModelLeaderboard({
  entries,
  totalRounds,
  loading,
}: ModelLeaderboardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="h-6 w-48 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="mt-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded"
              style={{ background: "var(--surface-dim)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const maxWinRate = Math.max(...entries.map((e) => e.win_rate), 0.01);

  return (
    <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
          Model Leaderboard
        </h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {totalRounds} round{totalRounds !== 1 ? "s" : ""} completed
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          No model performance data yet. The leaderboard will populate as
          deliberations complete.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Model</th>
                <th className="pb-2 pr-3 text-right">Win Rate</th>
                <th className="pb-2 pr-3 text-right">Wins</th>
                <th className="pb-2 text-right">Avg Rank</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={entry.model_name}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-3 pr-3">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className="font-medium"
                      style={{ color: "var(--foreground)" }}
                      title={entry.model_name}
                    >
                      {entry.display_name}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--surface-dim)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: "var(--accent)",
                            width: `${(entry.win_rate / maxWinRate) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-semibold" style={{ color: "var(--foreground)" }}>
                        {(entry.win_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right" style={{ color: "var(--muted)" }}>
                    {entry.wins}/{entry.total_ranked}
                  </td>
                  <td className="py-3 text-right" style={{ color: "var(--muted)" }}>
                    {entry.avg_rank?.toFixed(1) ?? "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
