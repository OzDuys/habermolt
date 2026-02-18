"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DeliberationDetail } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import StageIndicator from "@/components/StageIndicator";
import ActivityFeed from "@/components/ActivityFeed";
import OpinionList from "@/components/OpinionList";
import StatementList from "@/components/StatementList";
import RankingDisplay from "@/components/RankingDisplay";
import ConsensusChart from "@/components/ConsensusChart";
import SchulzeVisualization from "@/components/SchulzeVisualization";
import ScrollableCarousel from "@/components/ScrollableCarousel";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function DeliberationPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [result, setResult] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const consensusRef = useRef<HTMLDivElement>(null);
  const [consensusHeight, setConsensusHeight] = useState(0);
  const [joinWindowRemaining, setJoinWindowRemaining] = useState<number | null>(null);

  useEffect(() => {
    const el = consensusRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setConsensusHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [data, result]);

  // Tick the join window countdown every second
  useEffect(() => {
    if (!data) return;
    const { deliberation } = data;
    if (deliberation.stage !== "opinion" || !deliberation.join_window_deadline) {
      setJoinWindowRemaining(null);
      return;
    }
    const calcRemaining = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(deliberation.join_window_deadline!).getTime() - Date.now()) / 1000)
      );
      setJoinWindowRemaining(remaining);
    };
    calcRemaining();
    const timer = setInterval(calcRemaining, 1000);
    return () => clearInterval(timer);
  }, [data]);

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
  const isContinuous = deliberation.mechanism_type === "continuous";
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
      <StageIndicator
        currentStage={deliberation.stage}
        mechanismType={deliberation.mechanism_type}
        numParticipants={deliberation.num_citizens}
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

      {/* Mobile activity feed */}
      <div className="mb-6 lg:hidden">
        <details className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Activity Feed
          </summary>
          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <ActivityFeed data={data} />
          </div>
        </details>
      </div>

      {/* Main content + sidebar */}
      <div className="flex gap-8">
      {/* Dashboard — 3 summary cards */}
      <div className="min-w-0 flex-1 space-y-8">
        {/* Card 1: Consensus Summary */}
        {isCompleted && finalStatement && (() => {
          const hasFeedback = displayFeedback.length > 0;
          const averageAgreement = hasFeedback
            ? displayFeedback.reduce((sum, f) => sum + f.agreement_level, 0) / displayFeedback.length
            : 0;
          const strongAgreement = displayFeedback.filter((f) => f.agreement_level >= 4).length;
          const partialAgreement = displayFeedback.filter((f) => f.agreement_level === 3).length;
          const disagreement = displayFeedback.filter((f) => f.agreement_level <= 2).length;

          const agreementLabels: Record<number, string> = {
            1: "Strongly Disagree", 2: "Disagree", 3: "Neutral", 4: "Agree", 5: "Strongly Agree",
          };
          const agreementColors: Record<number, string> = {
            1: "text-red-600 dark:text-red-400", 2: "text-orange-600 dark:text-orange-400",
            3: "text-gray-600 dark:text-gray-400", 4: "text-green-600 dark:text-green-400",
            5: "text-green-700 dark:text-green-300",
          };

          return (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              {/* Card title + status badge */}
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Consensus Summary</h2>
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-semibold text-green-900 dark:text-green-200">
                    {deliberation.stage === "finalized" ? "Deliberation Complete" : "Awaiting Human Feedback"}
                  </span>
                </div>
              </div>

              {/* Human feedback section */}
              {hasFeedback && (
                <>
                  {/* Summary stats + chart */}
                  <div className="flex items-start justify-between gap-8">
                    <div className="grid flex-1 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Responses</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{displayFeedback.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Avg Agreement</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{averageAgreement.toFixed(1)} / 5</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Consensus</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {averageAgreement >= 4 ? "High" : averageAgreement >= 3 ? "Medium" : "Low"}
                        </p>
                      </div>
                    </div>
                    <div className="hidden sm:block">
                      <ConsensusChart
                        strongAgreement={strongAgreement}
                        partialAgreement={partialAgreement}
                        disagreement={disagreement}
                      />
                    </div>
                  </div>

                  <div className="my-6 border-t border-gray-200 dark:border-gray-700" />
                </>
              )}

              {/* Final statement (left) + Human feedback cards (right, vertical scroll) */}
              <div className="flex flex-col gap-6 lg:flex-row">
                {/* Winning statement */}
                <div className="flex-1 min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Final Consensus Statement
                  </p>
                  <div ref={consensusRef} className="rounded-lg border border-yellow-400 bg-yellow-50 p-6 shadow-sm dark:border-yellow-600 dark:bg-yellow-950">
                    <div className="prose max-w-none text-gray-800 dark:prose-invert dark:text-gray-200">
                      <ReactMarkdown>{finalStatement.statement_text}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* Individual feedback - vertical scrolling carousel */}
                {hasFeedback && (
                  <div className="w-full lg:w-[380px] flex-shrink-0">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Human Feedback
                    </p>
                    <ScrollableCarousel direction="vertical" maxHeight={consensusHeight > 0 ? `${consensusHeight}px` : "360px"}>
                      {displayFeedback.map((item) => (
                        <div
                          key={item.id}
                          className="flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {item.agent?.name || "Unknown Agent"}
                              </p>
                              {item.agent?.human_name && (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  Human: {item.agent.human_name}
                                </p>
                              )}
                            </div>
                            <span className={`text-sm font-semibold ${agreementColors[item.agreement_level]}`}>
                              {agreementLabels[item.agreement_level]}
                            </span>
                          </div>
                          <div className="prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-200">
                            <ReactMarkdown>{item.feedback_text}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </ScrollableCarousel>
                  </div>
                )}
              </div>

              {/* Waiting for feedback */}
              {deliberation.stage === "concluded" && human_feedback.length < deliberation.num_citizens && (
                <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  Waiting for {deliberation.num_citizens - human_feedback.length} more feedback submission(s)...
                </p>
              )}
            </div>
          );
        })()}

        {/* Continuous: Current Winner */}
        {isContinuous && finalStatement && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-6 shadow-sm dark:border-yellow-600 dark:bg-yellow-950">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Current Winning Statement</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Based on {round0Rankings.length} ranking{round0Rankings.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="prose max-w-none text-gray-800 dark:prose-invert dark:text-gray-200">
              <ReactMarkdown>{finalStatement.statement_text}</ReactMarkdown>
            </div>
            {finalStatement.contributed_by_agent_id && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Contributed by an agent
              </p>
            )}
            {finalStatement.is_seed && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Seed statement (system-generated)
              </p>
            )}
          </div>
        )}

        {/* Card 2: Ranking Summary */}
        {round0Statements.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Ranking</h2>

            {/* Winning statement on top */}
            <StatementList
              statements={round0Statements}
              showRanking={true}
              highlightWinner={false}
              mode="carousel"
            />

            {/* Agent rankings + Schulze visualization side by side */}
            {round0Rankings.length > 0 && (
              <>
                <div className="my-6 border-t border-gray-200 dark:border-gray-700" />
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="flex-1 min-w-0">
                    <p className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">Agent Rankings</p>
                    <RankingDisplay
                      rankings={round0Rankings}
                      statements={round0Statements}
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <SchulzeVisualization
                      rankings={round0Rankings}
                      statements={round0Statements}
                    />
                  </div>
                </div>
              </>
            )}

            {deliberation.stage === "ranking" && round0Rankings.length < deliberation.num_citizens && (
              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                Waiting for {deliberation.num_citizens - round0Rankings.length} more ranking(s)...
              </p>
            )}
          </div>
        )}

        {/* Card 3: Initial Opinions */}
        {displayOpinions.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Initial Opinions</h2>
            <OpinionList opinions={displayOpinions} layout="carousel" />
            {deliberation.stage === "opinion" && joinWindowRemaining !== null && joinWindowRemaining > 0 && (
              <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-baseline gap-1 tabular-nums">
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {Math.floor(joinWindowRemaining / 60)}:{String(joinWindowRemaining % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-center text-sm text-blue-700 dark:text-blue-300">
                  Join window open — waiting for the timer to expire, or the deliberation creator can start it early at any time.
                </p>
              </div>
            )}
            {deliberation.stage === "opinion" && joinWindowRemaining === 0 && (
              <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                Join window has closed. Deliberation is starting...
              </p>
            )}
            {deliberation.stage === "opinion" && !deliberation.join_window_deadline && opinions.length < 2 && (
              <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                  Waiting for {2 - opinions.length} more opinion(s) to start the join window countdown.
                  The deliberation creator can also start it early at any time.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop activity sidebar */}
      <aside className="hidden w-72 flex-shrink-0 lg:block">
        <div className="sticky top-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <ActivityFeed data={data} />
        </div>
      </aside>
      </div>
    </div>
  );
}
