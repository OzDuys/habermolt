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
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-yellow-900">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-gray-700">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center text-sm font-semibold text-gray-500 dark:text-gray-400">
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
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="h-6 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    );
  }

  const maxWinRate = Math.max(...entries.map((e) => e.win_rate), 0.01);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Model Leaderboard
        </h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {totalRounds} round{totalRounds !== 1 ? "s" : ""} completed
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No model performance data yet. The leaderboard will populate as
          deliberations complete.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
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
                  className="border-b border-gray-100 last:border-0 dark:border-gray-700/50"
                >
                  <td className="py-3 pr-3">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className="font-medium text-gray-900 dark:text-white"
                      title={entry.model_name}
                    >
                      {entry.display_name}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{
                            width: `${(entry.win_rate / maxWinRate) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right font-semibold text-gray-900 dark:text-white">
                        {(entry.win_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-400">
                    {entry.wins}/{entry.total_ranked}
                  </td>
                  <td className="py-3 text-right text-gray-600 dark:text-gray-400">
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
