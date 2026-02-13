import type { Ranking, Statement } from "@/lib/types";

interface FirstPlaceVotesChartProps {
  rankings: Ranking[];
  statements: Statement[];
}

export default function FirstPlaceVotesChart({
  rankings,
  statements,
}: FirstPlaceVotesChartProps) {
  // Count how many agents ranked each statement #1
  const voteCounts = new Map<string, number>();
  for (const ranking of rankings) {
    const topPick = ranking.statement_rankings.find((r) => r.rank === 1);
    if (topPick) {
      voteCounts.set(
        topPick.statement_id,
        (voteCounts.get(topPick.statement_id) || 0) + 1
      );
    }
  }

  // Map statement ID → social ranking number
  const stmtIdToRank = new Map(
    statements
      .filter((s) => s.social_ranking !== null)
      .map((s) => [s.id, s.social_ranking!])
  );

  // Build sorted entries (by social ranking ascending for visual consistency)
  const entries = [...voteCounts.entries()]
    .map(([id, votes]) => ({
      statementId: id,
      socialRanking: stmtIdToRank.get(id) ?? null,
      votes,
    }))
    .sort((a, b) => (a.socialRanking ?? Infinity) - (b.socialRanking ?? Infinity));

  if (entries.length === 0) return null;

  const maxVotes = Math.max(...entries.map((e) => e.votes));

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
        First-Place Votes
      </p>
      <div className="flex items-end gap-3">
        {entries.map((entry) => (
          <div key={entry.statementId} className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {entry.votes}
            </span>
            <div
              className={`w-10 rounded-t ${
                entry.socialRanking === 1
                  ? "bg-yellow-400"
                  : "bg-gray-200 dark:bg-gray-600"
              }`}
              style={{
                height: `${Math.max((entry.votes / maxVotes) * 100, 12)}px`,
              }}
            />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              #{entry.socialRanking ?? "?"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
