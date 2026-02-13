"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Statement } from "@/lib/types";
import ScrollableCarousel from "./ScrollableCarousel";

interface StatementListProps {
  statements: Statement[];
  showRanking?: boolean;
  highlightWinner?: boolean;
  columns?: 1 | 2;
  mode?: "grid" | "preview-carousel" | "carousel";
}

function StatementCard({
  statement,
  showRanking,
  highlightWinner = true,
  className = "",
  capped = false,
}: {
  statement: Statement;
  showRanking: boolean;
  highlightWinner?: boolean;
  className?: string;
  capped?: boolean;
}) {
  const [expanded, setCardExpanded] = useState(false);
  const isWinner = highlightWinner && statement.social_ranking === 1;

  return (
    <div
      className={`rounded-lg border p-6 shadow-sm ${
        isWinner
          ? "border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-950"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      } ${className}`}
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
      </div>
      <div className="relative">
        <div
          className={`prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-200 ${
            capped && !expanded ? "max-h-[200px] overflow-hidden" : ""
          }`}
        >
          <ReactMarkdown>{statement.statement_text}</ReactMarkdown>
        </div>
        {capped && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white dark:from-gray-800" />
        )}
      </div>
      {capped && (
        <button
          type="button"
          onClick={() => setCardExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      {statement.meta_data?.explanation && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
            View explanation
          </summary>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {statement.meta_data.explanation}
          </p>
        </details>
      )}
    </div>
  );
}

export default function StatementList({
  statements,
  showRanking = true,
  highlightWinner = true,
  columns = 1,
  mode = "grid",
}: StatementListProps) {
  const [expanded, setExpanded] = useState(false);

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

  if (mode === "carousel") {
    return (
      <ScrollableCarousel>
        {sortedStatements.map((statement) => (
          <StatementCard
            key={statement.id}
            statement={statement}
            showRanking={showRanking}
            highlightWinner={highlightWinner}
            capped
            className="min-w-[85vw] max-w-[400px] flex-shrink-0 snap-start sm:min-w-[300px]"
          />
        ))}
      </ScrollableCarousel>
    );
  }

  if (mode === "preview-carousel") {
    const winner = sortedStatements.find((s) => s.social_ranking === 1);
    const rest = sortedStatements.filter((s) => s.social_ranking !== 1);

    return (
      <div>
        {winner && (
          <StatementCard statement={winner} showRanking={showRanking} highlightWinner={highlightWinner} />
        )}
        {rest.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <svg
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {expanded ? "Hide" : "View all"} {rest.length} other statement{rest.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <ScrollableCarousel className="mt-3">
                {rest.map((statement) => (
                  <StatementCard
                    key={statement.id}
                    statement={statement}
                    showRanking={showRanking}
                    highlightWinner={highlightWinner}
                    capped
                    className="min-w-[85vw] max-w-[400px] flex-shrink-0 snap-start sm:min-w-[300px]"
                  />
                ))}
              </ScrollableCarousel>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={columns === 2 ? "grid grid-cols-1 gap-4 md:grid-cols-2" : "space-y-4"}>
      {sortedStatements.map((statement) => (
        <StatementCard key={statement.id} statement={statement} showRanking={showRanking} highlightWinner={highlightWinner} />
      ))}
    </div>
  );
}
