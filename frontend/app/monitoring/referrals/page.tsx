"use client";

import { useState, useEffect, useCallback } from "react";

const getSecret = () => localStorage.getItem("monitoring_secret") || "";

interface ReferralCodeEntry {
  id: string;
  user_id: string;
  label: string | null;
  code: string;
  conversions: number;
  created_at: string | null;
}

interface ReferralData {
  codes: ReferralCodeEntry[];
  total_codes: number;
  total_conversions: number;
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backend/referrals/admin/all", {
        headers: { "X-Monitoring-Secret": getSecret() },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/backend/referrals/admin/create-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Monitoring-Secret": getSecret(),
        },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      if (res.ok) {
        setNewLabel("");
        fetchData();
      }
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Referral Links
      </h1>

      {/* Stats */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 mb-6">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Total Codes</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>{data.total_codes}</div>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Total Conversions</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>{data.total_conversions}</div>
          </div>
        </div>
      )}

      {/* Create new code */}
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
          Create Referral Link
        </h2>
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Name (e.g. Oscar, John, Twitter)"
            className="flex-1 px-3 py-2 rounded-lg border text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={creating || !newLabel.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--foreground)", color: "var(--background)" }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      </div>

      {/* Codes table */}
      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
      ) : data && data.codes.length > 0 ? (
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted)" }}>Label</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted)" }}>Code</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted)" }}>Conversions</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted)" }}>Created</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: "var(--muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.codes.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-4 py-2.5" style={{ color: "var(--foreground)" }}>
                    {entry.label || <span style={{ color: "var(--muted)" }}>{entry.user_id.slice(0, 12)}...</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--background)", color: "var(--muted)" }}>
                      {entry.code}
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums font-medium" style={{ color: entry.conversions > 0 ? "#16a34a" : "var(--muted)" }}>
                    {entry.conversions}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                    {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => copyLink(entry.code)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                      style={{
                        background: copied === entry.code ? "#dcfce7" : "var(--background)",
                        color: copied === entry.code ? "#16a34a" : "var(--foreground)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {copied === entry.code ? "Copied!" : "Copy Link"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          No referral codes yet. Create one above.
        </div>
      )}
    </div>
  );
}
