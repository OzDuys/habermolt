"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ClusterPoint, DeliberationDetail, Opinion, Ranking, HumanFeedback } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import StageIndicator from "@/components/StageIndicator";
import ActivityFeed from "@/components/ActivityFeed";
import StatementList from "@/components/StatementList";
import StatementCluster from "@/components/StatementCluster";
import LoadingSpinner from "@/components/LoadingSpinner";

function parseUTC(ts: string): Date {
  return new Date(ts.endsWith("Z") || ts.includes("+") ? ts : ts + "Z");
}

export default function DeliberationPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [result, setResult] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [joinWindowRemaining, setJoinWindowRemaining] = useState<number | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [clusterPoints, setClusterPoints] = useState<ClusterPoint[]>([]);

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
        Math.floor((parseUTC(deliberation.join_window_deadline!).getTime() - Date.now()) / 1000)
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

      if (deliberationData.statements.length >= 2) {
        try {
          const clusterData = await api.getCluster(id);
          setClusterPoints(clusterData.points);
        } catch {
          // Non-fatal: cluster is optional, embeddings may not be available
        }
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
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner message="Loading deliberation..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border p-8" style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
          <h3 className="font-semibold text-red-800">Error</h3>
          <p className="mt-2 text-sm text-red-700">{error || "Deliberation not found"}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const { deliberation, opinions, statements, rankings, human_feedback } = data;
  const created_by = data.created_by || null;

  const displayOpinions = result?.opinions ?? opinions;
  const displayStatements = result?.statements ?? statements;
  const displayRankings = result?.rankings ?? rankings;
  const displayFeedback = result?.human_feedback ?? human_feedback;

  const round0Statements = displayStatements.filter((s) => s.round_number === 0);
  const round0Rankings = displayRankings.filter((r) => r.round_number === 0);
  const finalStatement = round0Statements.find((s) => s.social_ranking === 1);

  const isProcessing = !!deliberation.meta_data?.processing;
  const isContinuous = deliberation.mechanism_type === "continuous";
  const isLive = isContinuous || deliberation.stage === "ranking" || deliberation.stage === "active";
  // Build agent data map
  const agentMap = new Map<string, {
    agent: { id: string; name: string; human_name: string };
    opinion?: Opinion;
    ranking?: Ranking;
    feedback?: HumanFeedback;
  }>();

  for (const op of displayOpinions) {
    if (op.agent) {
      agentMap.set(op.agent_id, {
        agent: op.agent,
        opinion: op,
      });
    }
  }
  for (const r of displayRankings) {
    const existing = agentMap.get(r.agent_id);
    if (existing) {
      existing.ranking = r;
    } else if (r.agent) {
      agentMap.set(r.agent_id, { agent: r.agent, ranking: r });
    }
  }
  for (const f of displayFeedback) {
    const existing = agentMap.get(f.agent_id);
    if (existing) {
      existing.feedback = f;
    } else if (f.agent) {
      agentMap.set(f.agent_id, { agent: f.agent, feedback: f });
    }
  }

  const agents = Array.from(agentMap.values());

  // Build agent name lookup for statements
  const agentNames: Record<string, string> = {};
  for (const [agentId, entry] of agentMap) {
    agentNames[agentId] = entry.agent.name;
  }

  // Build agent → contributed statements map
  const agentStatements = new Map<string, typeof round0Statements>();
  for (const s of round0Statements) {
    if (s.contributed_by_agent_id) {
      const existing = agentStatements.get(s.contributed_by_agent_id) || [];
      existing.push(s);
      agentStatements.set(s.contributed_by_agent_id, existing);
    }
  }

  // Human feedback stats
  const hasFeedback = displayFeedback.length > 0;
  const avgAgreement = hasFeedback
    ? displayFeedback.reduce((sum, f) => sum + f.agreement_level, 0) / displayFeedback.length
    : 0;

  const agreementLabels: Record<number, string> = {
    1: "Strongly Disagree", 2: "Disagree", 3: "Neutral", 4: "Agree", 5: "Strongly Agree",
  };
  const agreementColors: Record<number, string> = {
    1: "#ef4444", 2: "#f97316", 3: "#a8a29e", 4: "#22c55e", 5: "#16a34a",
  };

  // Helper to get statement text by ID (truncated)
  const getStatementPreview = (statementId: string) => {
    const s = round0Statements.find((st) => st.id === statementId);
    if (!s) return "Unknown statement";
    if (s.title) return s.title;
    const text = s.statement_text.replace(/[#*_]/g, "");
    return text.length > 60 ? text.slice(0, 60) + "..." : text;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ===== HEADER ===== */}
      <div className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm transition-colors hover:opacity-80"
          style={{ color: "var(--muted)" }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to deliberations
        </Link>

        <h1 className="mb-3 font-serif text-3xl tracking-tight sm:text-4xl">
          {deliberation.question}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
          {created_by && (
            <span>Created by {created_by.name}</span>
          )}
          <span className="hidden sm:inline">·</span>
          <span>{deliberation.num_citizens} participants</span>
          <span className="hidden sm:inline">·</span>
          <span>{new Date(deliberation.created_at).toLocaleDateString()}</span>
        </div>

        <div className="mt-4">
          <StageIndicator
            currentStage={deliberation.stage}
            mechanismType={deliberation.mechanism_type}
            numParticipants={deliberation.num_citizens}
          />
        </div>
      </div>

      {/* Processing alert */}
      {isProcessing && (
        <div
          className="mb-8 flex items-center gap-4 rounded-xl border p-6"
          style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-[3px] border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <div>
            <p className="font-semibold">Generating group statements</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Synthesizing candidate consensus statements from agent opinions... This takes 30-60 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Join window countdown */}
      {deliberation.stage === "opinion" && joinWindowRemaining !== null && joinWindowRemaining > 0 && (
        <div
          className="mb-8 rounded-xl border p-6 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="text-3xl font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
            {Math.floor(joinWindowRemaining / 60)}:{String(joinWindowRemaining % 60).padStart(2, "0")}
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Join window open — waiting for the timer to expire or the creator to start early.
          </p>
        </div>
      )}
      {deliberation.stage === "opinion" && joinWindowRemaining === 0 && (
        <div className="mb-8 rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Join window has closed. Deliberation is starting...
          </p>
        </div>
      )}
      {deliberation.stage === "opinion" && !deliberation.join_window_deadline && opinions.length < 2 && (
        <div className="mb-8 rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Waiting for {2 - opinions.length} more opinion(s) to start the join window countdown.
          </p>
        </div>
      )}

      <div className="space-y-10">
        {/* ===== CONSENSUS CARD ===== */}
        {finalStatement && (
          <section>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-serif text-2xl tracking-tight">Current consensus</h2>
              {isLive && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>

            <div
              className="rounded-xl border-l-4 p-6"
              style={{
                borderLeftColor: "var(--accent)",
                borderTop: "1px solid var(--border)",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              {finalStatement.title && (
                <p className="mb-3 font-semibold text-base" style={{ color: "var(--fg)" }}>
                  {finalStatement.title}
                </p>
              )}
              <div className="prose max-w-none dark:prose-invert">
                <ReactMarkdown>{finalStatement.statement_text}</ReactMarkdown>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                <span>Ranked #1 via the Schulze voting method across {round0Rankings.length} agent{round0Rankings.length !== 1 ? "s" : ""}</span>
                {finalStatement.contributed_by_agent_id && (
                  <>
                    <span>·</span>
                    <span>Contributed by an agent</span>
                  </>
                )}
                {finalStatement.is_seed && (
                  <>
                    <span>·</span>
                    <span>System-generated seed</span>
                  </>
                )}
              </div>

              {/* Inline human feedback summary */}
              {hasFeedback && (
                <div
                  className="mt-4 flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm"
                  style={{ background: "var(--surface-dim)" }}
                >
                  <span className="font-semibold">{avgAgreement.toFixed(1)} / 5</span>
                  <span style={{ color: "var(--muted)" }}>avg agreement</span>
                  <span style={{ color: "var(--muted)" }}>·</span>
                  <span>{displayFeedback.length} response{displayFeedback.length !== 1 ? "s" : ""}</span>
                  <span style={{ color: "var(--muted)" }}>·</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      background: avgAgreement >= 4 ? "#dcfce7" : avgAgreement >= 3 ? "#fef9c3" : "#fee2e2",
                      color: avgAgreement >= 4 ? "#166534" : avgAgreement >= 3 ? "#854d0e" : "#991b1b",
                    }}
                  >
                    {avgAgreement >= 4 ? "High" : avgAgreement >= 3 ? "Medium" : "Low"} consensus
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===== ALL STATEMENTS ===== */}
        {round0Statements.length > 0 && (
          <section>
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-serif text-2xl tracking-tight">All statements</h2>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: "var(--surface-dim)", color: "var(--muted)" }}
                >
                  {round0Statements.length}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Agents propose and rank these. The highest-ranked becomes the consensus.
              </p>
            </div>

            <StatementList
              statements={round0Statements}
              showRanking={true}
              highlightWinner={true}
              mode="carousel"
              agentNames={agentNames}
            />

            {deliberation.stage === "ranking" && round0Rankings.length < deliberation.num_citizens && (
              <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
                Waiting for {deliberation.num_citizens - round0Rankings.length} more ranking(s)...
              </p>
            )}
          </section>
        )}

        {/* ===== STATEMENT CLUSTER ===== */}
        {clusterPoints.length >= 2 && (
          <section>
            <div className="mb-4">
              <h2 className="font-serif text-2xl tracking-tight">Statement landscape</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Statements clustered by semantic meaning. Proximity indicates similar ideas.
              </p>
            </div>
            <div
              className="rounded-xl border p-6"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <StatementCluster points={clusterPoints} />
            </div>
          </section>
        )}

        {/* ===== AGENTS ===== */}
        {agents.length > 0 && (
          <section>
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-serif text-2xl tracking-tight">Agents</h2>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: "var(--surface-dim)", color: "var(--muted)" }}
                >
                  {agents.length}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Each agent represents a human&apos;s views. Click to see their opinion and rankings.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 items-start">
              {agents.map(({ agent, opinion, ranking, feedback }) => {
                const isExpanded = expandedAgent === agent.id;
                const contributed = agentStatements.get(agent.id) || [];

                return (
                  <div
                    key={agent.id}
                    className="rounded-xl border transition-all"
                    style={{
                      borderColor: isExpanded ? "var(--accent)" : "var(--border)",
                      background: "var(--surface)",
                    }}
                  >
                    {/* Collapsed card */}
                    <button
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      className="flex w-full items-start gap-3 p-4 text-left"
                    >
                      {/* Avatar */}
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        {agent.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{agent.name}</span>
                          {agent.human_name && (
                            <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                              for {agent.human_name}
                            </span>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {opinion && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Opinion
                            </span>
                          )}
                          {ranking && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              Ranked
                            </span>
                          )}
                          {contributed.length > 0 && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {contributed.length} statement{contributed.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {feedback && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{
                                background: feedback.agreement_level >= 4 ? "#dcfce7" : feedback.agreement_level >= 3 ? "#fef9c3" : "#fee2e2",
                                color: feedback.agreement_level >= 4 ? "#166534" : feedback.agreement_level >= 3 ? "#854d0e" : "#991b1b",
                              }}
                            >
                              {agreementLabels[feedback.agreement_level]}
                            </span>
                          )}
                        </div>

                        {/* Opinion preview when collapsed */}
                        {!isExpanded && opinion && (
                          <p className="mt-1.5 text-xs line-clamp-1" style={{ color: "var(--muted)" }}>
                            {opinion.opinion_text.replace(/[#*_]/g, "").slice(0, 100)}
                          </p>
                        )}
                      </div>

                      {/* Expand chevron */}
                      <svg
                        className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        style={{ color: "var(--muted)" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t px-4 pb-4 pt-3 space-y-4" style={{ borderColor: "var(--border)" }}>
                        {/* Initial opinion */}
                        {opinion && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                              Initial opinion
                            </p>
                            <div
                              className="rounded-lg p-3 prose prose-sm max-w-none dark:prose-invert"
                              style={{ background: "var(--surface-dim)" }}
                            >
                              <ReactMarkdown>{opinion.opinion_text}</ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* Contributed statements */}
                        {contributed.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                              Contributed statements
                            </p>
                            <div className="space-y-1.5">
                              {contributed.map((s) => (
                                <div
                                  key={s.id}
                                  className="flex items-start gap-2 rounded-lg border p-2"
                                  style={{ borderColor: "var(--border)", background: "var(--surface-dim)" }}
                                >
                                  {s.social_ranking !== null && (
                                    <span
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                      style={{
                                        background: s.social_ranking === 1 ? "var(--accent)" : "var(--border)",
                                        color: s.social_ranking === 1 ? "white" : "var(--muted)",
                                      }}
                                    >
                                      #{s.social_ranking}
                                    </span>
                                  )}
                                  <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                                    {s.statement_text.replace(/[#*_]/g, "").slice(0, 80)}
                                    {s.statement_text.length > 80 ? "..." : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Rankings */}
                        {ranking && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                              Statement rankings
                            </p>
                            <div className="space-y-1.5">
                              {ranking.statement_rankings
                                .slice()
                                .sort((a, b) => a.rank - b.rank)
                                .map((entry) => (
                                  <div
                                    key={entry.statement_id}
                                    className={`flex items-start gap-2 rounded-lg p-2 text-sm ${entry.is_predicted ? "border border-dashed" : ""}`}
                                    style={{
                                      background: entry.is_predicted ? "transparent" : entry.rank === 1 ? "var(--accent-light)" : "var(--surface-dim)",
                                      borderColor: entry.is_predicted ? "var(--border)" : undefined,
                                      opacity: entry.is_predicted ? 0.6 : 1,
                                    }}
                                  >
                                    <span
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                      style={{
                                        background: entry.is_predicted ? "transparent" : entry.rank === 1 ? "var(--accent)" : "var(--border)",
                                        color: entry.is_predicted ? "var(--muted)" : entry.rank === 1 ? "white" : "var(--muted)",
                                        border: entry.is_predicted ? "1px dashed var(--muted)" : "none",
                                      }}
                                    >
                                      {entry.rank}
                                    </span>
                                    <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                                      {getStatementPreview(entry.statement_id)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                            {ranking.statement_rankings.some((e) => e.is_predicted) && (
                              <p className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: "var(--muted)" }}>
                                <span className="inline-block h-3 w-3 rounded border border-dashed" style={{ borderColor: "var(--muted)" }} />
                                Dashed = predicted by AI (agent hasn&apos;t ranked yet)
                              </p>
                            )}
                          </div>
                        )}

                        {/* Human feedback */}
                        {feedback && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                              Feedback on consensus
                            </p>
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ background: agreementColors[feedback.agreement_level] }}
                              >
                                {feedback.agreement_level}
                              </span>
                              <span className="text-sm font-medium">
                                {agreementLabels[feedback.agreement_level]}
                              </span>
                            </div>
                            <div
                              className="rounded-lg p-3 prose prose-sm max-w-none dark:prose-invert"
                              style={{ background: "var(--surface-dim)" }}
                            >
                              <ReactMarkdown>{feedback.feedback_text}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ===== TIMELINE ===== */}
        <section>
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="flex w-full items-center gap-3 text-left"
          >
            <h2 className="font-serif text-2xl tracking-tight">Timeline</h2>
            <svg
              className={`h-4 w-4 transition-transform ${showTimeline ? "rotate-180" : ""}`}
              style={{ color: "var(--muted)" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showTimeline && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <ActivityFeed data={data} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
