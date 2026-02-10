"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DeliberationDetail, ActiveView } from "@/lib/types";
import { toActiveView, activeViewKey } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import StageIndicator from "@/components/StageIndicator";
import OpinionList from "@/components/OpinionList";
import StatementList from "@/components/StatementList";
import RankingDisplay from "@/components/RankingDisplay";
import CritiqueDisplay from "@/components/CritiqueDisplay";
import HumanFeedbackDisplay from "@/components/HumanFeedbackDisplay";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function DeliberationPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [result, setResult] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>({ type: "opinion" });
  const prevViewKey = useRef<string | null>(null);

  useEffect(() => {
    loadDeliberation();

    // Poll every 5 seconds for updates
    const interval = setInterval(loadDeliberation, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const loadDeliberation = async () => {
    try {
      setError(null);
      const deliberationData = await api.getDeliberation(id);
      setData(deliberationData);

      // If finalized, also fetch the result
      if (deliberationData.deliberation.stage === "finalized") {
        const resultData = await api.getDeliberationResult(id);
        setResult(resultData);
      }

      // Track the active view to the current stage when the backend state advances
      const newView = toActiveView(
        deliberationData.deliberation.stage,
        deliberationData.deliberation.current_critique_round
      );
      const newKey = activeViewKey(newView);
      if (prevViewKey.current !== newKey) {
        setActiveView(newView);
        prevViewKey.current = newKey;
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

  const { deliberation, opinions, statements, rankings, critiques, human_feedback } = data;
  const created_by = data.created_by || null;

  // Use result data when available (finalized stage has complete data)
  const displayOpinions = result?.opinions ?? opinions;
  const displayStatements = result?.statements ?? statements;
  const displayCritiques = result?.critiques ?? critiques;
  const displayRankings = result?.rankings ?? rankings;
  const displayFeedback = result?.human_feedback ?? human_feedback;

  // Round-filtered data for the active round view
  const activeRound = activeView.type === "round" ? activeView.round : 0;
  const roundStatements = displayStatements.filter((s) => s.round_number === activeRound);
  const roundRankings = displayRankings.filter((r) => r.round_number === activeRound);
  const roundCritiques = displayCritiques.filter((c) => c.round_number === activeRound);
  const roundWinner = roundStatements.find((s) => s.social_ranking === 1);

  // Current round state helpers
  const isRankingPhase =
    deliberation.stage === "ranking" && deliberation.current_critique_round === activeRound;
  const isCritiquePhase =
    deliberation.stage === "critique" && deliberation.current_critique_round === activeRound;

  // Determine if Habermas is processing (generating statements)
  const joinWindowExpired = deliberation.join_window_deadline &&
    new Date(deliberation.join_window_deadline) <= new Date();
  const isProcessing =
    (deliberation.stage === "opinion" &&
      joinWindowExpired &&
      statements.length === 0) ||
    (deliberation.stage === "critique" &&
      critiques.filter((c) => c.round_number === deliberation.current_critique_round)
        .length === deliberation.num_citizens &&
      deliberation.current_critique_round < deliberation.num_critique_rounds - 1);

  // Final statement for the completed view
  const lastRound = deliberation.num_critique_rounds - 1;
  const lastRoundStatements = displayStatements.filter((s) => s.round_number === lastRound);
  const finalStatement = lastRoundStatements.find((s) => s.social_ranking === 1);

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
          <span>
            Participants: {deliberation.num_citizens}
          </span>
          {deliberation.num_critique_rounds > 1 && (
            <span>
              Round: {deliberation.current_critique_round + 1} /{" "}
              {deliberation.num_critique_rounds}
            </span>
          )}
          <span>Created {new Date(deliberation.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Stage Progress (clickable navigation) */}
      <StageIndicator
        currentStage={deliberation.stage}
        currentCritiqueRound={deliberation.current_critique_round}
        numCritiqueRounds={deliberation.num_critique_rounds}
        activeView={activeView}
        onViewChange={setActiveView}
      />

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

      {/* Stage-Specific Content (driven by active view) */}
      <div className="space-y-8">
        {/* Opinion View */}
        {activeView.type === "opinion" && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
              Initial Opinions
            </h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              Agents are submitting their initial opinions based on their human&apos;s
              preferences.
            </p>
            <OpinionList opinions={displayOpinions} />
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

        {/* Round View (Ranking + Critique combined for a given round) */}
        {activeView.type === "round" && (
          <div className="space-y-8">
            {/* Ranking Section */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <section className="lg:col-span-2">
                <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
                  Aggregated Results
                </h2>
                <p className="mb-4 text-gray-600 dark:text-gray-400">
                  Social choice ranking aggregated from all agent rankings.
                </p>
                <StatementList statements={roundStatements} showRanking={true} columns={2} />
                {isRankingPhase && roundRankings.length < deliberation.num_citizens && (
                  <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                    Waiting for{" "}
                    {deliberation.num_citizens - roundRankings.length}{" "}
                    more ranking(s)...
                  </p>
                )}
              </section>

              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
                  Agent Rankings
                </h2>
                <p className="mb-4 text-gray-600 dark:text-gray-400">
                  Each agent&apos;s preference order (by social rank #).
                </p>
                <RankingDisplay rankings={roundRankings} statements={roundStatements} />
              </section>
            </div>

            {/* Critique Section (shown once critiques exist or critique phase is active) */}
            {(roundCritiques.length > 0 || isCritiquePhase) && (
              <div className="space-y-6">
                {roundWinner && (
                  <section>
                    <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
                      Winning Statement
                    </h2>
                    <p className="mb-4 text-gray-600 dark:text-gray-400">
                      The top-ranked consensus statement being critiqued.
                    </p>
                    <StatementList statements={[roundWinner]} showRanking={false} />
                  </section>
                )}

                <section>
                  <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
                    Critiques
                  </h2>
                  <p className="mb-4 text-gray-600 dark:text-gray-400">
                    Agents are critiquing the winning statement from this round.
                  </p>
                  <CritiqueDisplay critiques={roundCritiques} />
                  {isCritiquePhase && roundCritiques.length < deliberation.num_citizens && (
                    <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      Waiting for{" "}
                      {deliberation.num_citizens - roundCritiques.length}{" "}
                      more critique(s)...
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        {/* Completed View (concluded + finalized) */}
        {activeView.type === "completed" && (
          <>
            {/* Final Consensus */}
            {finalStatement && (
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
              </section>
            )}

            {/* Human Feedback */}
            {displayFeedback.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">
                  Human Feedback
                </h2>
                <HumanFeedbackDisplay feedback={displayFeedback} />
              </section>
            )}

            {deliberation.stage === "concluded" &&
              human_feedback.length < deliberation.num_citizens && (
                <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Waiting for{" "}
                  {deliberation.num_citizens - human_feedback.length} more
                  feedback submission(s)...
                </p>
              )}
          </>
        )}
      </div>
    </div>
  );
}
