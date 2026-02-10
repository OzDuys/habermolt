import ReactMarkdown from "react-markdown";
import type { Statement } from "@/lib/types";

interface StatementListProps {
  statements: Statement[];
  showRanking?: boolean;
  columns?: 1 | 2;
}

export default function StatementList({
  statements,
  showRanking = true,
  columns = 1,
}: StatementListProps) {
  if (statements.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-400">
          No statements generated yet. Waiting for statement generation...
        </p>
        <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  const hasRankings = statements.some((s) => s.social_ranking !== null);
  const sortedStatements =
    showRanking && hasRankings
      ? [...statements].sort(
          (a, b) => (a.social_ranking ?? Infinity) - (b.social_ranking ?? Infinity)
        )
      : statements;

  return (
    <div className={columns === 2 ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "space-y-4"}>
      {sortedStatements.map((statement) => {
        const isWinner = statement.social_ranking === 1;

        return (
          <div
            key={statement.id}
            className={`rounded-lg border p-6 shadow-sm ${
              isWinner
                ? "border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-950"
                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {showRanking && statement.social_ranking !== null && (
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                      isWinner
                        ? "bg-yellow-400 text-yellow-900"
                        : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    #{statement.social_ranking}
                  </div>
                )}
                {isWinner && (
                  <span className="rounded-full bg-yellow-400 px-3 py-1 text-xs font-semibold text-yellow-900">
                    Winner
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                Round {statement.round_number}
              </span>
            </div>
            <div className="prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-200">
              <ReactMarkdown>{statement.statement_text}</ReactMarkdown>
            </div>
            {statement.metadata?.explanation && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                  View explanation
                </summary>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {statement.metadata.explanation}
                </p>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
