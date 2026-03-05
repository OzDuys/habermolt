"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface TraceDetail {
  id: string;
  trace_type: string;
  status: string;
  model: string;
  provider: string | null;
  temperature: number | null;
  input_messages: Array<{ role: string; content: string }>;
  output_text: string | null;
  reasoning_text: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  error_message: string | null;
  deliberation_id: string | null;
  agent_id: string | null;
  created_at: string;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

export default function TraceDetailPage() {
  const params = useParams();
  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/backend/monitoring/traces/${params.id}`, {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => r.json())
      .then(setTrace)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  if (!trace) return <div className="text-sm text-red-500">Trace not found</div>;

  return (
    <div className="max-w-5xl">
      <Link
        href="/monitoring/traces"
        className="text-xs hover:opacity-70 mb-4 inline-block"
        style={{ color: "var(--muted)" }}
      >
        ← Back to traces
      </Link>

      <h1 className="text-2xl font-bold mb-6">Trace Detail</h1>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetaCard label="Type" value={trace.trace_type} mono />
        <MetaCard label="Model" value={trace.model} mono />
        <MetaCard label="Status" value={trace.status} badge={trace.status === "error" ? "error" : "success"} />
        <MetaCard label="Provider" value={trace.provider || "—"} />
        <MetaCard label="Temperature" value={trace.temperature?.toString() || "—"} />
        <MetaCard label="Tokens In" value={trace.tokens_in?.toLocaleString() || "—"} />
        <MetaCard label="Tokens Out" value={trace.tokens_out?.toLocaleString() || "—"} />
        <MetaCard label="Latency" value={trace.latency_ms ? `${trace.latency_ms.toLocaleString()}ms` : "—"} />
      </div>

      {/* Context Links */}
      <div className="flex gap-3 mb-6">
        {trace.deliberation_id && (
          <Link
            href={`/monitoring/deliberations/${trace.deliberation_id}`}
            className="text-xs px-3 py-1.5 rounded-lg border hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
          >
            View Deliberation →
          </Link>
        )}
        <div className="text-xs px-3 py-1.5" style={{ color: "var(--muted)" }}>
          {new Date(trace.created_at).toLocaleString()}
        </div>
      </div>

      {/* Input Messages */}
      <Section title="Input Messages">
        <div className="space-y-3">
          {trace.input_messages.map((msg, i) => (
            <div
              key={i}
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "var(--surface)", color: "var(--muted)" }}
              >
                {msg.role}
              </div>
              <pre className="px-3 py-3 text-xs whitespace-pre-wrap overflow-auto max-h-[600px]">
                {msg.content}
              </pre>
            </div>
          ))}
        </div>
      </Section>

      {/* Output */}
      {trace.output_text && (
        <Section title="Output">
          <pre
            className="p-4 rounded-lg border text-xs whitespace-pre-wrap overflow-auto max-h-[600px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {trace.output_text}
          </pre>
        </Section>
      )}

      {/* Reasoning */}
      {trace.reasoning_text && (
        <Section title="Reasoning">
          <pre
            className="p-4 rounded-lg border text-xs whitespace-pre-wrap overflow-auto max-h-[400px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {trace.reasoning_text}
          </pre>
        </Section>
      )}

      {/* Error */}
      {trace.error_message && (
        <Section title="Error">
          <pre className="p-4 rounded-lg border text-xs whitespace-pre-wrap bg-red-50 text-red-800 border-red-200">
            {trace.error_message}
          </pre>
        </Section>
      )}
    </div>
  );
}

function MetaCard({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: "success" | "error";
}) {
  return (
    <div
      className="p-3 rounded-lg border"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {badge ? (
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            badge === "error"
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {value}
        </span>
      ) : (
        <div className={`text-sm ${mono ? "font-mono" : ""} truncate`}>{value}</div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}
