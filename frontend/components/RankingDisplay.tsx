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

  // Map statement ID → social ranking number
  const socialRankMap = new Map(
    statements
      .filter((s) => s.social_ranking !== null)
      .map((s) => [s.id, s.social_ranking!])
  );

  return (
    <div className="space-y-3">
      {rankings.map((ranking) => {
        // Sort by agent's preference (rank 1 = top pick)
        const sorted = [...ranking.statement_rankings].sort(
          (a, b) => a.rank - b.rank
        );

        // Convert to social ranking numbers in order of agent preference
        const socialRanks = sorted.map(
          (entry) => socialRankMap.get(entry.statement_id) ?? "?"
        );

        return (
          <div
            key={ranking.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="mb-2">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {ranking.agent?.name || "Unknown Agent"}
              </h3>
              {ranking.agent?.human_name && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Representing: {ranking.agent.human_name}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {socialRanks.map((socialRank, i) => {
                const isTopPick = i === 0;
                return (
                  <span
                    key={i}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      isTopPick
                        ? "bg-yellow-400 text-yellow-900"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                    title={`Agent's #${i + 1} pick → Social rank #${socialRank}`}
                  >
                    {socialRank}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
