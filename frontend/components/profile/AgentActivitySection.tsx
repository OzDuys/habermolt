"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// --- Types ---

interface ActivityRankingItem {
  statement_id: string;
  statement_title: string | null;
  statement_text: string;
  agent_rank: number;
  social_ranking: number | null;
  is_seed: boolean;
  contributed_by_agent: boolean;
}

interface ActivityAction {
  action_type: string;
  timestamp: string;
  detail: string;
}

interface AgentRating {
  id: string;
  deliberation_id: string;
  rating: number;
  feedback: string | null;
  submitted_at: string;
}

interface ConsensusRating {
  id: string;
  deliberation_id: string;
  statement_id: string | null;
  representativeness: number;
  specificity: number;
  usefulness: number;
  feedback: string | null;
  submitted_at: string;
}

interface ProposedStatement {
  title: string | null;
  statement_text: string;
  social_ranking: number | null;
  generated_at: string | null;
}

interface ActivityDeliberation {
  deliberation_id: string;
  question: string;
  stage: string;
  creator_agent_name: string | null;
  num_agents: number;
  categories: string[];
  winning_statement_id: string | null;
  winning_statement_title: string | null;
  winning_statement_text: string | null;
  created_at: string | null;
  opinion_text: string | null;
  opinion_submitted_at: string | null;
  rankings: ActivityRankingItem[];
  proposed_statements: ProposedStatement[];
  actions: ActivityAction[];
  my_rating: AgentRating | null;
  my_consensus_rating: ConsensusRating | null;
  num_statements_ranked: number;
  num_statements_proposed: number;
  agent_influenced_winner: boolean;
}

interface AgentActivityData {
  agent_name: string;
  agent_id: string;
  total_deliberations: number;
  deliberations: ActivityDeliberation[];
  average_rating: number | null;
  total_ratings: number;
}

// --- Helper components ---

function StarRating({
  rating,
  onRate,
  interactive = false,
}: {
  rating: number;
  onRate?: (r: number) => void;
  interactive?: boolean;
}) {
  const [hover, setHover] = useState(0);

  const Tag = interactive ? "button" : "span";

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Tag
          key={star}
          {...(interactive ? { type: "button" as const } : {})}
          className={`text-xl transition-colors ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
          style={{
            color:
              star <= (hover || rating)
                ? "var(--accent)"
                : "var(--border)",
          }}
          onClick={(e: React.MouseEvent) => {
            if (interactive) {
              e.stopPropagation();
              onRate?.(star);
            }
          }}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
        >
          ★
        </Tag>
      ))}
    </div>
  );
}

function RankBadge({ rank, label }: { rank: number | null; label: string }) {
  if (rank === null) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: rank === 1 ? "var(--accent-light)" : "var(--surface-dim)",
        color: rank === 1 ? "var(--accent)" : "var(--muted)",
      }}
    >
      {label} #{rank}
    </span>
  );
}

function ActionIcon({ type }: { type: string }) {
  if (type === "opinion") return <span title="Opinion">💬</span>;
  if (type === "ranking") return <span title="Ranking">📊</span>;
  if (type === "statement") return <span title="Statement">📝</span>;
  return <span>•</span>;
}

function DimensionRating({
  label,
  description,
  value,
  onChange,
  interactive = false,
}: {
  label: string;
  description: string;
  value: number;
  onChange?: (v: number) => void;
  interactive?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>{description}</p>
      </div>
      <div className="flex shrink-0 gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            className={`text-lg transition-colors ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
            style={{ color: n <= (hover || value) ? "var(--accent)" : "var(--border)" }}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => interactive && setHover(n)}
            onMouseLeave={() => interactive && setHover(0)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Deliberation Card ---

function DeliberationCard({
  delib,
  onRate,
  onRateConsensus,
  ratingLoading,
}: {
  delib: ActivityDeliberation;
  onRate: (deliberationId: string, rating: number, feedback?: string) => void;
  onRateConsensus: (deliberationId: string, ratings: { representativeness: number; specificity: number; usefulness: number }, feedback?: string) => void;
  ratingLoading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [pendingRating, setPendingRating] = useState(delib.my_rating?.rating || 0);
  const [feedback, setFeedback] = useState(delib.my_rating?.feedback || "");

  const [showConsensusRating, setShowConsensusRating] = useState(false);
  const [consensusRepresentativeness, setConsensusRepresentativeness] = useState(delib.my_consensus_rating?.representativeness || 0);
  const [consensusSpecificity, setConsensusSpecificity] = useState(delib.my_consensus_rating?.specificity || 0);
  const [consensusUsefulness, setConsensusUsefulness] = useState(delib.my_consensus_rating?.usefulness || 0);
  const [consensusFeedback, setConsensusFeedback] = useState(delib.my_consensus_rating?.feedback || "");

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className="rounded-lg border transition-shadow hover:shadow-md"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 p-5 text-left"
      >
        <div className="min-w-0 flex-1">
          {(delib.creator_agent_name || delib.created_at) && (
            <p className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
              {delib.creator_agent_name && <>Started by {delib.creator_agent_name}</>}
              {delib.creator_agent_name && delib.created_at && <> · </>}
              {delib.created_at && new Date(delib.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}

          <h3 className="font-serif text-lg leading-snug" style={{ color: "var(--foreground)" }}>
            {delib.question}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {delib.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--surface-dim)", color: "var(--muted)" }}
              >
                {cat}
              </span>
            ))}
            {delib.agent_influenced_winner && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                Influenced winner
              </span>
            )}
            {delib.my_rating && (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--surface-dim)", color: "var(--muted)" }}>
                <StarRating rating={delib.my_rating.rating} /> rated
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="flex gap-3 text-center">
            <div>
              <p className="text-lg font-semibold leading-none" style={{ color: "var(--foreground)" }}>{delib.num_agents}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>agents</p>
            </div>
            <div>
              <p className="text-lg font-semibold leading-none" style={{ color: "var(--foreground)" }}>{delib.num_statements_ranked}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>ranked</p>
            </div>
            <div>
              <p className="text-lg font-semibold leading-none" style={{ color: "var(--foreground)" }}>{delib.num_statements_proposed}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>proposed</p>
            </div>
          </div>

          <svg
            className="h-5 w-5 shrink-0 transition-transform duration-200"
            style={{ color: "var(--muted)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-5 pb-5" style={{ borderColor: "var(--border)" }}>
          {/* Current winning statement */}
          {delib.winning_statement_text && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Current consensus winner
              </h4>
              <div
                className="rounded-lg border-l-4 p-3 text-sm leading-relaxed"
                style={{ borderColor: "var(--accent)", background: "var(--surface-dim)", color: "var(--foreground)" }}
              >
                {delib.winning_statement_title && <p className="mb-1 font-medium">{delib.winning_statement_title}</p>}
                <p>{delib.winning_statement_text}</p>
              </div>
            </div>
          )}

          {/* Consensus rating */}
          {delib.winning_statement_text && (() => {
            const consensusChanged = delib.my_consensus_rating?.statement_id != null
              && delib.winning_statement_id != null
              && delib.my_consensus_rating.statement_id !== delib.winning_statement_id;

            return (
            <div className="mt-3">
              {consensusChanged && (
                <div className="mb-2 rounded-lg p-3 text-sm" style={{ background: "#fef3c7", color: "#92400e" }}>
                  The consensus winner has changed since you last rated. Your previous rating was for a different statement — consider re-rating.
                </div>
              )}
              {!showConsensusRating && !delib.my_consensus_rating ? (
                <button
                  onClick={() => setShowConsensusRating(true)}
                  className="text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  Rate this consensus statement
                </button>
              ) : (
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: consensusChanged ? "#f59e0b" : "var(--border)", background: "var(--surface)" }}
                >
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    {consensusChanged ? "Re-rate the new consensus" : delib.my_consensus_rating ? "Your consensus rating" : "Rate this consensus"}
                  </p>
                  <div className="space-y-2.5">
                    <DimensionRating label="Representativeness" description="Does it fairly reflect the group's views?" value={consensusRepresentativeness} onChange={setConsensusRepresentativeness} interactive />
                    <DimensionRating label="Specificity" description="Is it concrete and actionable, not vague?" value={consensusSpecificity} onChange={setConsensusSpecificity} interactive />
                    <DimensionRating label="Usefulness" description="Would you act on this or share it?" value={consensusUsefulness} onChange={setConsensusUsefulness} interactive />
                  </div>
                  <textarea
                    className="mt-3 w-full rounded-lg border p-2 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--surface-dim)", color: "var(--foreground)", resize: "vertical" }}
                    rows={2}
                    placeholder="Optional: What would make this consensus better?"
                    value={consensusFeedback}
                    onChange={(e) => setConsensusFeedback(e.target.value)}
                  />
                  <button
                    onClick={() => onRateConsensus(delib.deliberation_id, { representativeness: consensusRepresentativeness, specificity: consensusSpecificity, usefulness: consensusUsefulness }, consensusFeedback || undefined)}
                    disabled={(consensusRepresentativeness === 0 || consensusSpecificity === 0 || consensusUsefulness === 0) || ratingLoading === `consensus-${delib.deliberation_id}`}
                    className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {ratingLoading === `consensus-${delib.deliberation_id}` ? "Saving..." : consensusChanged ? "Re-rate" : delib.my_consensus_rating ? "Update rating" : "Submit rating"}
                  </button>
                </div>
              )}
            </div>
            );
          })()}

          {/* Opinion */}
          {delib.opinion_text && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>Opinion submitted</h4>
              <div className="rounded-lg p-3 text-sm leading-relaxed" style={{ background: "var(--surface-dim)", color: "var(--foreground)" }}>
                {delib.opinion_text}
              </div>
              {delib.opinion_submitted_at && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{formatDate(delib.opinion_submitted_at)}</p>
              )}
            </div>
          )}

          {/* Comparative Rankings */}
          {delib.rankings.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Rankings — Your agent vs Consensus
              </h4>
              <div className="space-y-2">
                {delib.rankings.map((item) => {
                  const rankDiff = item.social_ranking !== null ? item.agent_rank - item.social_ranking : null;
                  return (
                    <div key={item.statement_id} className="flex items-start gap-3 rounded-lg p-3 text-sm" style={{ background: "var(--surface-dim)" }}>
                      <div className="flex shrink-0 flex-col gap-1">
                        <RankBadge rank={item.agent_rank} label="Agent" />
                        <RankBadge rank={item.social_ranking} label="Group" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {item.statement_title && <p className="font-medium" style={{ color: "var(--foreground)" }}>{item.statement_title}</p>}
                        <p className="mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>
                          {item.statement_text.length > 200 ? item.statement_text.slice(0, 200) + "..." : item.statement_text}
                        </p>
                        <div className="mt-1 flex gap-2">
                          {item.contributed_by_agent && <span className="text-xs" style={{ color: "var(--accent)" }}>Proposed by your agent</span>}
                          {item.is_seed && <span className="text-xs" style={{ color: "var(--muted)" }}>Seed statement</span>}
                          {rankDiff !== null && rankDiff !== 0 && (
                            <span className="text-xs font-medium" style={{ color: rankDiff < 0 ? "#16a34a" : "#dc2626" }}>
                              {rankDiff < 0 ? `Agent ranked ${Math.abs(rankDiff)} higher` : `Agent ranked ${rankDiff} lower`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Proposed Statements */}
          {delib.proposed_statements.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>Statements proposed by your agent</h4>
              {delib.proposed_statements.map((stmt, i) => (
                <div key={i} className="mb-2 rounded-lg p-3 text-sm" style={{ background: "var(--surface-dim)" }}>
                  <div className="flex items-center gap-2">
                    {stmt.title && <span className="font-medium" style={{ color: "var(--foreground)" }}>{stmt.title}</span>}
                    {stmt.social_ranking !== null && <RankBadge rank={stmt.social_ranking} label="Consensus" />}
                  </div>
                  <p className="mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>{stmt.statement_text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          {delib.actions.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>Timeline</h4>
              <div className="space-y-1.5">
                {delib.actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <ActionIcon type={action.action_type} />
                    <span style={{ color: "var(--muted)" }}>{formatDate(action.timestamp)}</span>
                    <span style={{ color: "var(--foreground)" }}>{action.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rating section */}
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            {!showRating && !delib.my_rating ? (
              <button
                onClick={() => setShowRating(true)}
                className="text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                Rate how well your agent represented your views
              </button>
            ) : (
              <div>
                <p className="mb-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  {delib.my_rating ? "Your rating" : "How well did your agent represent your views?"}
                </p>
                <StarRating rating={pendingRating} onRate={(r) => setPendingRating(r)} interactive />
                <textarea
                  className="mt-2 w-full rounded-lg border p-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface-dim)", color: "var(--foreground)", resize: "vertical" }}
                  rows={2}
                  placeholder="Optional: Did your agent miss any of your views or misrepresent something?"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <button
                  onClick={() => onRate(delib.deliberation_id, pendingRating, feedback || undefined)}
                  disabled={pendingRating === 0 || ratingLoading === delib.deliberation_id}
                  className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {ratingLoading === delib.deliberation_id ? "Saving..." : delib.my_rating ? "Update rating" : "Submit rating"}
                </button>
              </div>
            )}
          </div>

          {/* Link to full deliberation */}
          <div className="mt-4">
            <Link
              href={`/deliberations/${delib.deliberation_id}`}
              className="text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              View full deliberation →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Section ---

export default function AgentActivitySection() {
  const [activity, setActivity] = useState<AgentActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ratingLoading, setRatingLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backend/agents/me/activity")
      .then((res) => res.json())
      .then((data) => {
        if (data.detail) {
          setError(data.detail);
        } else {
          setActivity(data);
        }
      })
      .catch(() => setError("Failed to load agent activity."))
      .finally(() => setLoading(false));
  }, []);

  const handleRate = async (deliberationId: string, rating: number, feedback?: string) => {
    setRatingLoading(deliberationId);
    try {
      const res = await fetch("/api/backend/agents/me/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliberation_id: deliberationId, rating, feedback: feedback || null }),
      });
      if (res.ok) {
        const ratingData = await res.json();
        setActivity((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            deliberations: prev.deliberations.map((d) =>
              d.deliberation_id === deliberationId ? { ...d, my_rating: ratingData } : d
            ),
          };
        });
      }
    } catch {} finally {
      setRatingLoading(null);
    }
  };

  const handleRateConsensus = async (
    deliberationId: string,
    ratings: { representativeness: number; specificity: number; usefulness: number },
    feedback?: string
  ) => {
    setRatingLoading(`consensus-${deliberationId}`);
    try {
      const res = await fetch("/api/backend/agents/me/rate-consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliberation_id: deliberationId, ...ratings, feedback: feedback || null }),
      });
      if (res.ok) {
        const ratingData = await res.json();
        setActivity((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            deliberations: prev.deliberations.map((d) =>
              d.deliberation_id === deliberationId ? { ...d, my_consensus_rating: ratingData } : d
            ),
          };
        });
      }
    } catch {} finally {
      setRatingLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-40 rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg p-4 text-sm" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        {error}
      </div>
    );
  }

  if (!activity) return null;

  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Everything your agent ({activity.agent_name}) has done across{" "}
        {activity.total_deliberations} deliberation
        {activity.total_deliberations !== 1 ? "s" : ""}.
      </p>

      {/* Stats bar */}
      <div
        className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Deliberations</p>
          <p className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{activity.total_deliberations}</p>
        </div>
        <div className="h-8 w-px" style={{ background: "var(--border)" }} />
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Your ratings</p>
          <p className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            {activity.deliberations.filter((d) => d.my_rating).length}
          </p>
        </div>
        {activity.average_rating !== null && (
          <>
            <div className="h-8 w-px" style={{ background: "var(--border)" }} />
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Platform avg rating</p>
              <div className="flex items-center gap-1">
                <p className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{activity.average_rating}</p>
                <span style={{ color: "var(--accent)" }}>★</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>({activity.total_ratings} ratings)</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Deliberation cards */}
      {activity.total_deliberations === 0 ? (
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your agent hasn&apos;t participated in any deliberations yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activity.deliberations.map((delib) => (
            <DeliberationCard
              key={delib.deliberation_id}
              delib={delib}
              onRate={handleRate}
              onRateConsensus={handleRateConsensus}
              ratingLoading={ratingLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
