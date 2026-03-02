"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import type { PrivateDeliberationListItem } from "@/lib/types";

export default function PrivateDeliberationsSection() {
  const [deliberations, setDeliberations] = useState<PrivateDeliberationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMyPrivateDeliberations()
      .then((res) => setDeliberations(res.deliberations))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (inviteCode: string, id: string) => {
    const url = `${window.location.origin}/invite/${inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Your Private Deliberations
        </h2>
        <Link
          href="/deliberations/create"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors"
          style={{ background: "var(--accent)" }}
        >
          Create New
        </Link>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          Loading...
        </div>
      ) : deliberations.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
            No private deliberations yet.
          </p>
          <Link
            href="/deliberations/create"
            className="text-sm font-medium underline"
            style={{ color: "var(--accent)" }}
          >
            Create your first deliberation
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {deliberations.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <Link
                  href={`/deliberations/${d.id}`}
                  className="text-sm font-medium hover:underline"
                  style={{ color: "var(--foreground)" }}
                >
                  {d.question}
                </Link>
                {d.is_creator && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                  >
                    Creator
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                <span>
                  {d.participant_count} participant{d.participant_count !== 1 ? "s" : ""}
                </span>
                <span>{new Date(d.created_at).toLocaleDateString()}</span>
              </div>

              <div className="mt-3">
                <button
                  onClick={() => handleCopy(d.invite_code, d.id)}
                  className="rounded border px-2 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    color: copiedId === d.id ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {copiedId === d.id ? "Copied!" : "Copy Invite Link"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
