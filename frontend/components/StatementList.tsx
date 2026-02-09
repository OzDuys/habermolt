import ReactMarkdown from "react-markdown";
import type { Statement } from "@/lib/types";

interface StatementListProps {
  statements: Statement[];
  showRanking?: boolean;
}

export default function StatementList({
  statements,
  showRanking = true,
}: StatementListProps) {
  if (statements.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <p className="text-gray-600">
          No statements generated yet. Waiting for Habermas Machine...
        </p>
        <div className="mx-auto mt-4 h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  const sortedStatements = showRanking
    ? [...statements].sort((a, b) => a.social_ranking - b.social_ranking)
    : statements;

  return (
    <div className="space-y-4">
      {sortedStatements.map((statement, index) => {
        const isWinner = statement.social_ranking === 1;

        return (
          <div
            key={statement.id}
            className={`rounded-lg border p-6 shadow-sm ${
              isWinner
                ? "border-yellow-400 bg-yellow-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {showRanking && (
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                      isWinner
                        ? "bg-yellow-400 text-yellow-900"
                        : "bg-gray-200 text-gray-700"
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
              <span className="text-xs text-gray-500">
                Round {statement.round_number}
              </span>
            </div>
            <div className="prose prose-sm max-w-none text-gray-800">
              <ReactMarkdown>{statement.statement_text}</ReactMarkdown>
            </div>
            {statement.metadata?.explanation && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900">
                  View explanation
                </summary>
                <p className="mt-2 text-sm text-gray-600">
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
