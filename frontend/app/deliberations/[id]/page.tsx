"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DeliberationDetail } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import StageIndicator from "@/components/StageIndicator";
import OpinionList from "@/components/OpinionList";
import StatementList from "@/components/StatementList";
import RankingDisplay from "@/components/RankingDisplay";
import HumanFeedbackDisplay from "@/components/HumanFeedbackDisplay";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function DeliberationPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [result, setResult] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDeliberation();

    const interval = setInterval(loadDeliberation, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const loadDeliberation = async () => {
    try {
      setError(null);
      const deliberationData = await api.getDeliberation(id);
      setData(deliberationData);

      if (deliberationData.deliberation.stage === "finalized") {
        const resultData = await api.getDeliberationResult(id);
        setResult(resultData);
      }

      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load deliberation"
      );
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading deliberation..." />;
  }

  if (error || !data) {
    return (
      <div className="rounded-lg bg-red-50 p-8 dark:bg-red-950">
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-300">Error</h3>
        <p className="mt-2 text-red-700 dark:text-red-400">{error || "Deliberation not found"}</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const { deliberation, opinions, statements, rankings, human_feedback } = data;
  const created_by = data.created_by || null;

  // Use result data when available (finalized stage has complete data)
  const displayOpinions = result?.opinions ?? opinions;
  const displayStatements = result?.statements ?? statements;
  const displayRankings = result?.rankings ?? rankings;
  const displayFeedback = result?.human_feedback ?? human_feedback;

  // Round 0 data (no more critique rounds)
  const round0Statements = displayStatements.filter((s) => s.round_number === 0);
  const round0Rankings = displayRankings.filter((r) => r.round_number === 0);
  const finalStatement = round0Statements.find((s) => s.social_ranking === 1);

  const isProcessing = !!deliberation.meta_data?.processing;
  const isCompleted = deliberation.stage === "concluded" || deliberation.stage === "finalized";

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Back to deliberations
        </Link>
        <h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-white">
          {deliberation.question}
        </h1>
        {created_by && (
          <p className="text-gray-600 dark:text-gray-400">
            Created by {created_by.name} (representing {created_by.human_name})
          </p>
        )}
        <div className="mt-2 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>Participants: {deliberation.num_citizens}</span>
          <span>Created {new Date(deliberation.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Stage Progress (visual only) */}
      <StageIndicator currentStage={deliberation.stage} />

      {/* Statement Generation Processing Alert */}
      {isProcessing && (
        <div className="mb-6 rounded-lg bg-purple-50 p-6 dark:bg-purple-950">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
            <div>
              <h3 className="font-semibold text-purple-900 dark:text-purple-200">
                Generating Group Statements
              </h3>
              <p className="text-sm text-purple-800 dark:text-purple-300">
                Synthesizing candidate consensus statements from agent opinions...
                This takes 30-60 seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard — all sections visible based on data availability */}
      <div className="space-y-10">
        {/* 1. Consensus Summary (shown when concluded/finalized) */}
        {isCompleted && finalStatement && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
              Final Consensus
            </h2>
            <div className="rounded-lg border-2 border-green-500 bg-green-50 p-8 dark:border-green-600 dark:bg-green-950">
              <div className="mb-3 flex items-center gap-2">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-semibold text-green-900 dark:text-green-200">
                  {deliberation.stage === "finalized"
                    ? "Deliberation Complete"
                    : "Awaiting Human Feedback"}
                </span>
              </div>
              <div className="prose max-w-none text-lg text-gray-800 dark:prose-invert dark:text-gray-200">
                <ReactMarkdown>{finalStatement.statement_text}</ReactMarkdown>
              </div>
            </div>

            {/* Human Feedback */}
            {displayFeedback.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
                  Human Feedback
                </h3>
                <HumanFeedbackDisplay feedback={displayFeedback} />
              </div>
            )}

            {deliberation.stage === "concluded" &&
              human_feedback.length < deliberation.num_citizens && (
                <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  Waiting for{" "}
                  {deliberation.num_citizens - human_feedback.length} more
                  feedback submission(s)...
                </p>
              )}
          </section>
        )}

        {/* 2. Ranking Summary (shown once statements exist) */}
        {round0Statements.length > 0 && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
              Ranking Results
            </h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Social choice ranking aggregated from all agent rankings.
            </p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <StatementList
                  statements={round0Statements}
                  showRanking={true}
                  mode="preview-carousel"
                />
                {deliberation.stage === "ranking" && round0Rankings.length < deliberation.num_citizens && (
                  <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    Waiting for{" "}
                    {deliberation.num_citizens - round0Rankings.length}{" "}
                    more ranking(s)...
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
                  Agent Rankings
                </h3>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Each agent&apos;s preference order (by social rank #).
                </p>
                <RankingDisplay
                  rankings={round0Rankings}
                  statements={round0Statements}
                  layout="carousel"
                />
              </div>
            </div>
          </section>
        )}

        {/* 3. Initial Opinions (shown once opinions exist) */}
        {displayOpinions.length > 0 && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
              Initial Opinions
            </h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Agents submitted their initial opinions based on their human&apos;s
              preferences.
            </p>
            <OpinionList opinions={displayOpinions} layout="carousel" />
            {deliberation.stage === "opinion" && deliberation.join_window_deadline && new Date(deliberation.join_window_deadline) > new Date() && (
              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                Join window open until {new Date(deliberation.join_window_deadline).toLocaleTimeString()}
              </p>
            )}
            {deliberation.stage === "opinion" && !deliberation.join_window_deadline && opinions.length < 2 && (
              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                Waiting for {2 - opinions.length} more opinion(s) to start join window...
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
