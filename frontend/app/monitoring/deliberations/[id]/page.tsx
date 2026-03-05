"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

interface DebugData {
  deliberation: {
    id: string;
    question: string;
    stage: string;
    num_citizens: number;
    created_at: string;
    updated_at: string | null;
    meta_data: Record<string, unknown>;
  };
  opinions: Array<{
    id: string;
    agent_id: string;
    agent_name: string;
    opinion_text: string;
    submitted_at: string | null;
  }>;
  statements: Array<{
    id: string;
    title: string | null;
    statement_text: string;
    social_ranking: number | null;
    is_seed: boolean;
    contributed_by_agent_id: string | null;
    meta_data: Record<string, unknown> | null;
    generated_at: string | null;
  }>;
  rankings: Array<{
    id: string;
    agent_id: string;
    agent_name: string;
    statement_rankings: Array<{ statement_id: string; rank: number; is_predicted?: boolean }>;
    submitted_at: string | null;
  }>;
  traces: Array<{
    id: string;
    trace_type: string;
    model: string;
    status: string;
    latency_ms: number | null;
    tokens_in: number | null;
    tokens_out: number | null;
    created_at: string;
  }>;
}

export default function DeliberationDebugDetailPage() {
  const params = useParams();
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/backend/monitoring/deliberations/${params.id}/debug`, {
      headers: { "X-Monitoring-Secret": getSecret() },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  if (!data) return <div className="text-sm text-red-500">Deliberation not found</div>;

  const d = data.deliberation;

  return (
    <div className="max-w-6xl">
      <Link
        href="/monitoring/deliberations"
        className="text-xs hover:opacity-70 mb-4 inline-block"
        style={{ color: "var(--muted)" }}
      >
        ← Back to deliberations
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold">{d.question}</h1>
        <Link
          href={`/monitoring/deliberations/${d.id}/live`}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          Live View →
        </Link>
      </div>

      {/* Info Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs" style={{ color: "var(--muted)" }}>
        <Badge color="blue">{d.stage}</Badge>
        <Badge color="gray">continuous</Badge>
        <span>{d.num_citizens} participants</span>
        <span>·</span>
        <span>Created {new Date(d.created_at).toLocaleString()}</span>
        <span>·</span>
        <span className="font-mono">{d.id}</span>
      </div>

      {/* Opinions */}
      <Section title={`Opinions (${data.opinions.length})`}>
        {data.opinions.length === 0 ? (
          <Muted>No opinions</Muted>
        ) : (
          <div className="space-y-2">
            {data.opinions.map((o) => (
              <div
                key={o.id}
                className="p-3 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-bold text-xs">{o.agent_name}</span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>
                    {o.agent_id.slice(0, 8)}
                  </span>
                </div>
                <p className="text-xs whitespace-pre-wrap">{o.opinion_text}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Statements */}
      <Section title={`Statements (${data.statements.length})`}>
        {data.statements.length === 0 ? (
          <Muted>No statements</Muted>
        ) : (
          <div className="space-y-3">
            {data.statements.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-lg border"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold text-sm">{s.title || "Untitled"}</span>
                  <div className="flex gap-1.5 shrink-0">
                    {s.social_ranking != null && (
                      <Badge color={s.social_ranking === 1 ? "yellow" : "gray"}>
                        #{s.social_ranking}
                      </Badge>
                    )}
                    {s.is_seed && <Badge color="blue">Seed</Badge>}
                  </div>
                </div>
                <p className="text-xs mb-2 whitespace-pre-wrap">{s.statement_text}</p>
                <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: "var(--muted)" }}>
                  <span>Model: {(s.meta_data as Record<string, string>)?.model || "N/A"}</span>
                </div>
                {(s.meta_data as Record<string, string>)?.reasoning && (
                  <details className="mt-2">
                    <summary className="text-[10px] cursor-pointer font-medium" style={{ color: "var(--foreground)" }}>
                      View reasoning
                    </summary>
                    <pre
                      className="mt-2 text-[10px] whitespace-pre-wrap p-2 rounded-lg max-h-[300px] overflow-auto"
                      style={{ background: "var(--background)" }}
                    >
                      {(s.meta_data as Record<string, string>).reasoning}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Rankings */}
      <Section title={`Rankings (${data.rankings.length})`}>
        {data.rankings.length === 0 ? (
          <Muted>No rankings</Muted>
        ) : (
          <div className="space-y-3">
            {data.rankings.map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-lg border"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-xs">{r.agent_name}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[...r.statement_rankings]
                    .sort((a, b) => a.rank - b.rank)
                    .map((sr, i) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          sr.is_predicted
                            ? "bg-orange-100 text-orange-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        #{sr.rank} → {sr.statement_id.slice(0, 8)}
                        {sr.is_predicted && " (pred)"}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* LLM Traces */}
      <Section title={`LLM Traces (${data.traces.length})`}>
        {data.traces.length === 0 ? (
          <Muted>No traces for this deliberation</Muted>
        ) : (
          <div className="space-y-1.5">
            {data.traces.map((t) => (
              <Link
                key={t.id}
                href={`/monitoring/traces/${t.id}`}
                className="flex items-center justify-between p-2.5 rounded-lg border text-xs transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono">{t.trace_type}</span>
                  <Badge color={t.status === "error" ? "red" : "green"}>{t.status}</Badge>
                </div>
                <div className="flex items-center gap-3" style={{ color: "var(--muted)" }}>
                  <span>{t.model}</span>
                  {t.latency_ms != null && <span>{t.latency_ms}ms</span>}
                  <span>{new Date(t.created_at).toLocaleTimeString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-gray-100 text-gray-700",
    yellow: "bg-yellow-100 text-yellow-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-xs" style={{ color: "var(--muted)" }}>{children}</div>;
}
