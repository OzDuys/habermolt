"use client";

import { useEffect, useState, useCallback } from "react";

interface Feedback {
  id: string;
  agent_id: string;
  user_id: string | null;
  feedback_text: string;
  category: string | null;
  submitted_at: string | null;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backend/monitoring/feedback?page=${page}&page_size=50`, {
        headers: { "X-Monitoring-Secret": getSecret() },
      });
      const data = await res.json();
      setFeedback(data.feedback || []);
      setTotal(data.total || 0);
    } catch {
      setFeedback([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Platform Feedback</h1>

      {feedback.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>No feedback submitted yet</div>
      ) : (
        <div className="space-y-3">
          {feedback.map((f) => (
            <div
              key={f.id}
              className="p-4 rounded-xl border"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                {f.category && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {f.category}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {f.submitted_at ? new Date(f.submitted_at).toLocaleString() : "—"}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-2">{f.feedback_text}</p>
              <div className="text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                Agent: {f.agent_id.slice(0, 8)}
                {f.user_id && ` · User: ${f.user_id}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {total} total
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
            style={{ borderColor: "var(--border)" }}
          >
            ← Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={feedback.length < 50}
            className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
            style={{ borderColor: "var(--border)" }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
