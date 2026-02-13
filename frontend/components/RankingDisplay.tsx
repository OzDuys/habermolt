"use client";

import { useState } from "react";
import type { Ranking, Statement } from "@/lib/types";

interface RankingDisplayProps {
  rankings: Ranking[];
  statements: Statement[];
  layout?: "vertical" | "carousel";
}

export default function RankingDisplay({
  rankings,
  statements,
  layout = "vertical",
}: RankingDisplayProps) {
  const [expanded, setExpanded] = useState(false);

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

  // Map statement ID → display number
  const hasSocialRanks = statements.some((s) => s.social_ranking !== null);
  const stmtIdToNumber = new Map(
    hasSocialRanks
      ? statements
          .filter((s) => s.social_ranking !== null)
          .map((s) => [s.id, s.social_ranking!])
      : statements.map((s, i) => [s.id, i + 1])
  );

  const rankingCard = (ranking: Ranking, className = "") => {
    const sorted = [...ranking.statement_rankings].sort(
      (a, b) => a.rank - b.rank
    );

    return (
      <div
        key={ranking.id}
        className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
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
          {sorted.map((entry, i) => {
            const isTopPick = i === 0;
            const num = stmtIdToNumber.get(entry.statement_id) ?? "?";
            const title = hasSocialRanks
              ? `Agent's #${i + 1} pick → Social rank #${num}`
              : `Agent's #${i + 1} pick → Statement #${num}`;

            return (
              <span
                key={i}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  isTopPick
                    ? "bg-yellow-400 text-yellow-900"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
                title={title}
              >
                {num}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  if (layout === "carousel") {
    const preview = rankings.slice(0, 2);
    const rest = rankings.slice(2);

    return (
      <div>
        {!hasSocialRanks && (
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Showing agent preference order by statement # (aggregated ranks pending).
          </p>
        )}
        <div className="space-y-3">
          {preview.map((r) => rankingCard(r))}
        </div>
        {rest.length > 0 && (
          <div className="mt-3">
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
              {expanded ? "Hide" : "View"} {rest.length} more ranking{rest.length !== 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="mt-3 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                {rest.map((r) =>
                  rankingCard(r, "min-w-[85vw] max-w-[300px] flex-shrink-0 snap-start sm:min-w-[250px]")
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hasSocialRanks && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing agent preference order by statement # (aggregated ranks pending).
        </p>
      )}
      {rankings.map((r) => rankingCard(r))}
    </div>
  );
}
