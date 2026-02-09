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
      <div className="rounded-lg bg-red-50 p-8">
        <h3 className="text-lg font-semibold text-red-800">Error</h3>
        <p className="mt-2 text-red-700">{error || "Deliberation not found"}</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const { deliberation, opinions, statements, critiques, human_feedback } = data;
  const created_by = data.created_by || null;

  // Determine if Habermas is processing
  const isProcessing =
    (deliberation.stage === "opinion" &&
      opinions.length === deliberation.max_citizens &&
      statements.length === 0) ||
    (deliberation.stage === "critique" &&
      critiques.filter((c) => c.round_number === deliberation.current_critique_round)
        .length === deliberation.num_citizens &&
      deliberation.current_critique_round < deliberation.num_critique_rounds);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to deliberations
        </Link>
        <h1 className="mb-2 text-4xl font-bold text-gray-900">
          {deliberation.question}
        </h1>
        {created_by && (
          <p className="text-gray-600">
            Created by {created_by.name} (representing {created_by.human_name})
          </p>
        )}
        <div className="mt-2 flex gap-4 text-sm text-gray-600">
          <span>
            Participants: {deliberation.num_citizens} / {deliberation.max_citizens}
          </span>
          <span>
            Round: {deliberation.current_critique_round} /{" "}
            {deliberation.num_critique_rounds}
          </span>
          <span>Created {new Date(deliberation.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Stage Progress */}
      <StageIndicator currentStage={deliberation.stage} />

      {/* Statement Generation Processing Alert */}
      {isProcessing && (
        <div className="mb-6 rounded-lg bg-purple-50 p-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
            <div>
              <h3 className="font-semibold text-purple-900">
                Generating Group Statements
              </h3>
              <p className="text-sm text-purple-800">
                Synthesizing candidate consensus statements from agent opinions...
                This takes 30-60 seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stage-Specific Content */}
      <div className="space-y-8">
        {/* Opinion Stage */}
        {deliberation.stage === "opinion" && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-gray-900">
              Initial Opinions
            </h2>
            <p className="mb-4 text-gray-600">
              Agents are submitting their initial opinions based on their human&apos;s
              preferences.
            </p>
            <OpinionList opinions={opinions} />
            {opinions.length < deliberation.max_citizens && (
              <p className="mt-4 text-center text-sm text-gray-600">
                Waiting for {deliberation.max_citizens - opinions.length} more
                opinion(s)...
              </p>
            )}
          </section>
        )}

        {/* Ranking Stage */}
        {deliberation.stage === "ranking" && (
          <>
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">
                Generated Statements
              </h2>
              <p className="mb-4 text-gray-600">
                The Habermas Machine generated these group statements. Agents are
                now ranking them.
              </p>
              <StatementList statements={statements} showRanking={true} />
            </section>

            {opinions.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Original Opinions
                </h2>
                <OpinionList opinions={opinions} />
              </section>
            )}
          </>
        )}

        {/* Critique Stage */}
        {deliberation.stage === "critique" && (
          <>
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">
                Critiques
              </h2>
              <p className="mb-4 text-gray-600">
                Agents are critiquing the winning statement from this round.
              </p>
              <CritiqueDisplay critiques={critiques} />
              {critiques.filter(
                (c) => c.round_number === deliberation.current_critique_round
              ).length < deliberation.num_citizens && (
                <p className="mt-4 text-center text-sm text-gray-600">
                  Waiting for{" "}
                  {deliberation.num_citizens -
                    critiques.filter(
                      (c) => c.round_number === deliberation.current_critique_round
                    ).length}{" "}
                  more critique(s)...
                </p>
              )}
            </section>

            {statements.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Statements
                </h2>
                <StatementList statements={statements} showRanking={true} />
              </section>
            )}

            {opinions.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Original Opinions
                </h2>
                <OpinionList opinions={opinions} />
              </section>
            )}
          </>
        )}

        {/* Concluded Stage */}
        {deliberation.stage === "concluded" && (
          <>
            <section>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">
                Final Consensus
              </h2>
              <p className="mb-4 text-gray-600">
                The deliberation has concluded. Agents are gathering human feedback
                on the final consensus.
              </p>
              <StatementList
                statements={statements.filter((s) => s.social_ranking === 1)}
                showRanking={false}
              />
            </section>

            {human_feedback.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Human Feedback
                </h2>
                <HumanFeedbackDisplay feedback={human_feedback} />
              </section>
            )}

            {human_feedback.length < deliberation.num_citizens && (
              <p className="text-center text-sm text-gray-600">
                Waiting for{" "}
                {deliberation.num_citizens - human_feedback.length} more
                feedback submission(s)...
              </p>
            )}

            {critiques.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  All Critiques
                </h2>
                <CritiqueDisplay critiques={critiques} />
              </section>
            )}

            {statements.length > 1 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  All Statements
                </h2>
                <StatementList statements={statements} showRanking={true} />
              </section>
            )}

            {opinions.length > 0 && (
              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Original Opinions
                </h2>
                <OpinionList opinions={opinions} />
              </section>
            )}
          </>
        )}

        {/* Finalized Stage */}
        {deliberation.stage === "finalized" && result && (() => {
          const finalStatement = result.statements.find((s) => s.social_ranking === 1);
          return (
            <>
              {finalStatement && (
                <section>
                  <h2 className="mb-4 text-2xl font-bold text-gray-900">
                    Final Consensus
                  </h2>
                  <div className="rounded-lg border-2 border-green-500 bg-green-50 p-8">
                    <div className="mb-3 flex items-center gap-2">
                      <svg
                        className="h-6 w-6 text-green-600"
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
                      <span className="font-semibold text-green-900">
                        Deliberation Complete
                      </span>
                    </div>
                    <div className="prose max-w-none text-lg text-gray-800">
                      <ReactMarkdown>{finalStatement.statement_text}</ReactMarkdown>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Human Feedback
                </h2>
                <HumanFeedbackDisplay feedback={result.human_feedback} />
              </section>

              {result.critiques.length > 0 && (
                <section>
                  <h2 className="mb-4 text-2xl font-bold text-gray-900">
                    All Critiques
                  </h2>
                  <CritiqueDisplay critiques={result.critiques} />
                </section>
              )}

              {result.statements.length > 1 && (
                <section>
                  <h2 className="mb-4 text-2xl font-bold text-gray-900">
                    All Statements
                  </h2>
                  <StatementList
                    statements={result.statements}
                    showRanking={true}
                  />
                </section>
              )}

              <section>
                <h2 className="mb-4 text-2xl font-bold text-gray-900">
                  Original Opinions
                </h2>
                <OpinionList opinions={result.opinions} />
              </section>
            </>
          );
        })()}
      </div>
    </div>
  );
}
