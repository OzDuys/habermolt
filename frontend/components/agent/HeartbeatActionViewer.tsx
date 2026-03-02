"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, Reorder } from "framer-motion";

interface HeartbeatAction {
  action: string;
  deliberation_id: string;
  question: string;
  description: string;
  opinion_text?: string;
  ranking_data?: { statement_id: string; rank: number }[];
  statement_title?: string;
  statement_text?: string;
}

const ACTION_ICONS: Record<string, string> = {
  join_deliberation: "\uD83D\uDCAC",
  rank_statements: "\uD83D\uDDF3\uFE0F",
  add_statement: "\uD83D\uDCDD",
};

export default function HeartbeatActionViewer({
  actions,
  startedAt,
}: {
  actions: HeartbeatAction[];
  startedAt: string;
}) {
  if (actions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No actions taken in this heartbeat session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">&#x2764;&#xFE0F;</span>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            Heartbeat Session
          </p>
          <p className="text-[10px]" style={{ color: "var(--muted)" }}>
            {new Date(startedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {actions.map((action, i) => (
        <ActionCard key={i} action={action} />
      ))}
    </div>
  );
}

function ActionCard({ action }: { action: HeartbeatAction }) {
  const [expanded, setExpanded] = useState(false);
  const icon = ACTION_ICONS[action.action] || "\u26A1";

  return (
    <motion.div
      className="rounded-lg border"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
      layout
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="text-base shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
            {action.description}
          </p>
          <p className="text-[10px] truncate" style={{ color: "var(--muted)" }}>
            {action.question}
          </p>
        </div>
        <span
          className="text-xs shrink-0 transition-transform"
          style={{ color: "var(--muted)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          &#x25BC;
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: "var(--border)" }}>
          {action.opinion_text && (
            <OpinionWithHistory
              currentText={action.opinion_text}
              deliberationId={action.deliberation_id}
            />
          )}

          {action.ranking_data && action.ranking_data.length > 0 && (
            <RankingEditor
              rankings={action.ranking_data}
              deliberationId={action.deliberation_id}
            />
          )}

          {action.statement_text && (
            <div className="mb-2">
              <p className="text-[10px] font-medium mb-1" style={{ color: "var(--muted)" }}>Proposed consensus:</p>
              {action.statement_title && (
                <p className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
                  {action.statement_title}
                </p>
              )}
              <p className="text-xs" style={{ color: "var(--foreground)" }}>{action.statement_text}</p>
            </div>
          )}

          {!action.opinion_text && !action.ranking_data && !action.statement_text && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>No detailed data available.</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

function RankingEditor({
  rankings: initialRankings,
  deliberationId,
}: {
  rankings: { statement_id: string; rank: number }[];
  deliberationId: string;
}) {
  const [items, setItems] = useState(() =>
    [...initialRankings].sort((a, b) => a.rank - b.rank)
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newRankings = items.map((item, i) => ({
        statement_id: item.statement_id,
        rank: i + 1,
      }));
      const res = await fetch(`/api/hosted-agent/rankings/${deliberationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rankings: newRankings }),
      });
      if (res.ok) {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [items, deliberationId]);

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-medium" style={{ color: "var(--muted)" }}>
          Statement rankings:
        </p>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Re-rank
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="text-[10px]"
              style={{ color: "var(--muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-[10px] font-medium disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {saved && (
        <p className="text-[10px] mb-1" style={{ color: "var(--accent)" }}>Rankings updated!</p>
      )}

      {editing ? (
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="space-y-1"
        >
          {items.map((item, i) => (
            <Reorder.Item
              key={item.statement_id}
              value={item}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-grab active:cursor-grabbing"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              <span className="text-[10px] font-bold shrink-0" style={{ color: "var(--accent)" }}>
                #{i + 1}
              </span>
              <span className="text-[10px] truncate" style={{ color: "var(--foreground)" }}>
                {item.statement_id.slice(0, 8)}...
              </span>
              <span className="ml-auto text-[10px]" style={{ color: "var(--muted)" }}>
                &#x2630;
              </span>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={item.statement_id} className="flex items-center gap-2">
              <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                #{i + 1}
              </span>
              <span className="text-[10px] truncate" style={{ color: "var(--foreground)" }}>
                {item.statement_id.slice(0, 8)}...
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface OpinionVersion {
  id: string;
  opinion_text: string;
  version: number;
  submitted_at: string;
}

function OpinionWithHistory({
  currentText,
  deliberationId,
}: {
  currentText: string;
  deliberationId: string;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<OpinionVersion[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (history) { setShowHistory(true); return; }
    setLoading(true);
    try {
      // We need the agent_id — fetch from the hosted agent's profile
      const meRes = await fetch("/api/hosted-agent");
      const meData = await meRes.json();
      if (!meData.id) return;

      // The hosted agent has a linked agent_id — we need to get it
      // For now, use the deliberation opinions endpoint which returns agent_id
      // Actually, the opinion-history endpoint needs agent_id. Let's get it from the hosted agent response.
      // The hosted agent doesn't directly expose agent_id in the response.
      // We'll need to try fetching from the profile endpoint which has agent info.
      const profileRes = await fetch("/api/profile");
      const profileData = await profileRes.json();
      const agentId = profileData.agent?.id;
      if (!agentId) return;

      const res = await fetch(`/api/deliberations/${deliberationId}/agents/${agentId}/opinion-history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        setShowHistory(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [deliberationId, history]);

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-medium" style={{ color: "var(--muted)" }}>
          Opinion submitted:
        </p>
        <button
          onClick={showHistory ? () => setShowHistory(false) : loadHistory}
          disabled={loading}
          className="text-[10px] font-medium hover:underline disabled:opacity-50"
          style={{ color: "var(--accent)" }}
        >
          {loading ? "Loading..." : showHistory ? "Hide history" : "View history"}
        </button>
      </div>

      {showHistory && history && history.length > 1 ? (
        <div className="space-y-2">
          {history.map((v) => (
            <div
              key={v.id}
              className="rounded-md border px-2 py-1.5"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                  v{v.version}
                </span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {new Date(v.submitted_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--foreground)" }}>
                {v.opinion_text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--foreground)" }}>{currentText}</p>
      )}
    </div>
  );
}
