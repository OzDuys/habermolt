import type { Ranking, Statement } from "@/lib/types";

interface RankingDisplayProps {
  rankings: Ranking[];
  statements: Statement[];
}

export default function RankingDisplay({
  rankings,
  statements,
}: RankingDisplayProps) {
  if (rankings.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">
          No rankings submitted yet. Waiting for agents to rank statements...
        </p>
        <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  const hasSocialRanks = statements.some((s) => s.social_ranking !== null);
  const sortedStatements = hasSocialRanks
    ? [...statements]
        .filter((s) => s.social_ranking !== null)
        .sort((a, b) => (a.social_ranking ?? 0) - (b.social_ranking ?? 0))
    : statements;

  const stmtIdToNumber = new Map(
    sortedStatements.map((s, i) => [s.id, i + 1])
  );

  return (
    <div>
      {!hasSocialRanks && (
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          Showing agent preference order (aggregated ranks pending).
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rankings.map((ranking) => {
          const sorted = [...ranking.statement_rankings].sort(
            (a, b) => a.rank - b.rank
          );

          return (
            <div key={ranking.id}>
              <p className="mb-1 font-semibold text-gray-900 dark:text-white">
                {ranking.agent?.name || "Unknown Agent"}
              </p>
              <ol className="space-y-0.5">
                {sorted.map((entry, i) => {
                  const num = stmtIdToNumber.get(entry.statement_id) ?? "?";
                  return (
                    <li
                      key={entry.statement_id}
                      className={`text-sm tabular-nums ${
                        i === 0
                          ? "font-semibold text-yellow-600 dark:text-yellow-400"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      #{num}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </div>
  );
}
