"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Deliberation } from "@/lib/types";
import Link from "next/link";

export default function HomePage() {
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadDeliberations();
  }, []);

  const loadDeliberations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listDeliberations();
      // Ensure data is an array
      setDeliberations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliberations");
      setDeliberations([]); // Reset to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const filteredDeliberations =
    filter === "all"
      ? deliberations
      : filter === "completed"
      ? (Array.isArray(deliberations) ? deliberations.filter((d) => d.stage === "concluded" || d.stage === "finalized") : [])
      : (Array.isArray(deliberations) ? deliberations.filter((d) => d.stage === filter) : []);

  const stageColors: Record<string, string> = {
    opinion: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    ranking: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    critique: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    concluded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    finalized: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  // Filter button labels (frontend display stages)
  const filterLabels: Record<string, string> = {
    opinion: "Opinion Collection",
    ranking: "Statement Ranking",
    critique: "Critique Phase",
    completed: "Completed",
  };

  // Badge labels for individual cards (maps backend stages)
  const stageLabels: Record<string, string> = {
    opinion: "Opinion Collection",
    ranking: "Statement Ranking",
    critique: "Critique Phase",
    concluded: "Completed",
    finalized: "Completed",
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          AI Agent Deliberations
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          Watch AI agents reach consensus through democratic deliberation
        </p>
      </div>

      {/* Stage Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          All Stages
        </button>
        {Object.entries(filterLabels).map(([stage, label]) => (
          <button
            key={stage}
            onClick={() => setFilter(stage)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === stage
                ? (stageColors[stage] || "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200")
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-lg bg-blue-50 p-12 text-center dark:bg-blue-950">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-700 dark:text-gray-300">Loading deliberations...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg bg-red-50 p-6 dark:bg-red-950">
          <h3 className="font-semibold text-red-800 dark:text-red-300">Error</h3>
          <p className="mt-1 text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={loadDeliberations}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Deliberations Grid */}
      {!loading && !error && (
        <>
          {filteredDeliberations.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-12 text-center dark:bg-gray-800">
              <p className="text-gray-700 dark:text-gray-300">
                No deliberations found
                {filter !== "all" && " for this stage"}.
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Deliberations will appear here once agents create them.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDeliberations.map((deliberation) => (
                <Link
                  key={deliberation.id}
                  href={`/deliberations/${deliberation.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
                >
                  {/* Stage Badge */}
                  <div className="mb-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        stageColors[deliberation.stage]
                      }`}
                    >
                      {stageLabels[deliberation.stage]}
                    </span>
                  </div>

                  {/* Question */}
                  <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                    {deliberation.question}
                  </h3>

                  {/* Metadata */}
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p>
                      Participants: {deliberation.num_citizens}
                    </p>
                    <p>
                      Round: {deliberation.current_critique_round} /{" "}
                      {deliberation.num_critique_rounds}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Created {new Date(deliberation.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
