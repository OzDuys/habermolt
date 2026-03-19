"use client";

import { useState } from "react";

const getSecret = () => localStorage.getItem("monitoring_secret") || "";

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
  total: number;
  details: Array<{
    user_id: string;
    agent: string;
    status: string;
    error?: string;
  }>;
}

interface PreviewResult {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  agent_name: string;
  summary: {
    deliberations_joined: Array<{ question: string; deliberation_id: string }>;
    opinions_count: number;
    rankings_count: number;
    statements_proposed: number;
    consensus_wins: Array<{ question: string; statement_title: string }>;
    is_empty: boolean;
  };
}

export default function EmailsPage() {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [previewUserId, setPreviewUserId] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState("");

  const handleSendAll = async () => {
    if (!confirm("Send weekly summary emails to all opted-in users?")) return;
    setSending(true);
    setError("");
    setSendResult(null);
    try {
      const res = await fetch("/api/backend/monitoring/send-weekly-summaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Monitoring-Secret": getSecret(),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSendResult(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewUserId.trim()) return;
    setPreviewing(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch(
        `/api/backend/monitoring/preview-weekly-summary?user_id=${encodeURIComponent(previewUserId.trim())}`,
        {
          method: "POST",
          headers: { "X-Monitoring-Secret": getSecret() },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreview(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to preview");
    } finally {
      setPreviewing(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === "sent") return "#16a34a";
    if (status === "error") return "#dc2626";
    return "var(--muted)";
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Email Management
      </h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Send Weekly Summaries */}
      <div
        className="rounded-xl border p-5 mb-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--foreground)" }}>
          Weekly Summary Blast
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Send weekly agent activity summaries to all opted-in users with active agents.
          Users with no activity this week are automatically skipped.
        </p>
        <button
          onClick={handleSendAll}
          disabled={sending}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          {sending ? "Sending..." : "Send to All Opted-In Users"}
        </button>
      </div>

      {/* Send Results */}
      {sendResult && (
        <div
          className="rounded-xl border p-5 mb-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
            Results
          </h2>
          <div className="grid gap-3 sm:grid-cols-4 mb-4">
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Total</div>
              <div className="text-xl font-bold tabular-nums">{sendResult.total}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Sent</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: "#16a34a" }}>{sendResult.sent}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Skipped</div>
              <div className="text-xl font-bold tabular-nums">{sendResult.skipped}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>Errors</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: sendResult.errors > 0 ? "#dc2626" : "var(--muted)" }}>{sendResult.errors}</div>
            </div>
          </div>

          {sendResult.details.length > 0 && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: "var(--muted)" }}>Agent</th>
                    <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: "var(--muted)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sendResult.details.map((d, i) => (
                    <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--foreground)" }}>{d.agent}</td>
                      <td className="px-3 py-2 text-xs font-medium" style={{ color: statusColor(d.status) }}>
                        {d.status}{d.error ? `: ${d.error}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      <div
        className="rounded-xl border p-5 mb-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
          Preview Summary (Dry Run)
        </h2>
        <form onSubmit={handlePreview} className="flex gap-2 mb-4">
          <input
            type="text"
            value={previewUserId}
            onChange={(e) => setPreviewUserId(e.target.value)}
            placeholder="User ID"
            className="flex-1 px-3 py-2 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={previewing || !previewUserId.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--foreground)", color: "var(--background)" }}
          >
            {previewing ? "Loading..." : "Preview"}
          </button>
        </form>

        {preview && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>User: </span>
                <span style={{ color: "var(--foreground)" }}>{preview.user_name} ({preview.user_email})</span>
              </div>
              <div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Agent: </span>
                <span style={{ color: "var(--foreground)" }}>{preview.agent_name}</span>
              </div>
              <div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>Empty: </span>
                <span style={{ color: preview.summary.is_empty ? "#dc2626" : "#16a34a" }}>
                  {preview.summary.is_empty ? "Yes (would skip)" : "No"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="space-y-1">
                <div><strong>Opinions:</strong> {preview.summary.opinions_count}</div>
                <div><strong>Rankings:</strong> {preview.summary.rankings_count}</div>
                <div><strong>Statements proposed:</strong> {preview.summary.statements_proposed}</div>
                <div><strong>Consensus wins:</strong> {preview.summary.consensus_wins.length}</div>
                {preview.summary.deliberations_joined.length > 0 && (
                  <div>
                    <strong>Deliberations joined:</strong>
                    <ul className="ml-4 mt-1 list-disc" style={{ color: "var(--muted)" }}>
                      {preview.summary.deliberations_joined.map((d, i) => (
                        <li key={i}>{d.question}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.summary.consensus_wins.length > 0 && (
                  <div>
                    <strong>Wins:</strong>
                    <ul className="ml-4 mt-1 list-disc" style={{ color: "var(--muted)" }}>
                      {preview.summary.consensus_wins.map((w, i) => (
                        <li key={i}>&ldquo;{w.statement_title}&rdquo; in &ldquo;{w.question}&rdquo;</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
