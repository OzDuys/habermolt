"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Trace {
  id: string;
  trace_type: string;
  status: string;
  model: string;
  provider: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  error_message: string | null;
  deliberation_id: string | null;
  created_at: string;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

const TRACE_TYPES = [
  "",
  "statement_generation",
  "ranking_prediction",
  "seed_opinion",
  "title_differentiation",
  "embedding",
];

export default function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    trace_type: "",
    status: "",
    model: "",
    deliberation_id: "",
  });

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), page_size: "50" });
    if (filters.trace_type) params.set("trace_type", filters.trace_type);
    if (filters.status) params.set("status", filters.status);
    if (filters.model) params.set("model", filters.model);
    if (filters.deliberation_id) params.set("deliberation_id", filters.deliberation_id);

    try {
      const res = await fetch(`/api/monitoring/traces?${params}`, {
        headers: { "X-Monitoring-Secret": getSecret() },
      });
      const data = await res.json();
      setTraces(data.traces || []);
      setTotal(data.total || 0);
    } catch {
      setTraces([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  const updateFilter = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">LLM Traces</h1>

      {/* Filters */}
      <div
        className="mb-4 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <FilterSelect
          label="Type"
          value={filters.trace_type}
          onChange={(v) => updateFilter("trace_type", v)}
          options={TRACE_TYPES.map((t) => ({ value: t, label: t || "All" }))}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => updateFilter("status", v)}
          options={[
            { value: "", label: "All" },
            { value: "success", label: "Success" },
            { value: "error", label: "Error" },
          ]}
        />
        <FilterInput
          label="Model"
          value={filters.model}
          onChange={(v) => updateFilter("model", v)}
          placeholder="Filter by model..."
        />
        <FilterInput
          label="Deliberation ID"
          value={filters.deliberation_id}
          onChange={(v) => updateFilter("deliberation_id", v)}
          placeholder="Filter by deliberation..."
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
      ) : traces.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>No traces found</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <TH>Type</TH>
                <TH>Model</TH>
                <TH>Status</TH>
                <TH>Tokens</TH>
                <TH>Latency</TH>
                <TH>Time</TH>
                <TH></TH>
              </tr>
            </thead>
            <tbody>
              {traces.map((t) => (
                <tr
                  key={t.id}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-3 py-2.5 font-mono text-xs">{t.trace_type}</td>
                  <td className="px-3 py-2.5 text-xs max-w-[200px] truncate">{t.model}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {t.tokens_in != null && t.tokens_out != null
                      ? `${(t.tokens_in + t.tokens_out).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {t.latency_ms != null ? `${t.latency_ms.toLocaleString()}ms` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/monitoring/traces/${t.id}`}
                      className="text-xs font-medium hover:opacity-70"
                      style={{ color: "var(--foreground)" }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {total.toLocaleString()} total traces
        </span>
        <div className="flex gap-2">
          <PaginationBtn
            label="← Prev"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          />
          <span className="text-xs px-2 py-1.5 tabular-nums" style={{ color: "var(--muted)" }}>
            Page {page}
          </span>
          <PaginationBtn
            label="Next →"
            onClick={() => setPage((p) => p + 1)}
            disabled={traces.length < 50}
          />
        </div>
      </div>
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isError = status === "error";
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
        isError ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      }`}
    >
      {status}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
        style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-lg border text-sm"
        style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
      />
    </div>
  );
}

function PaginationBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-30 transition-opacity hover:opacity-80"
      style={{ borderColor: "var(--border)" }}
    >
      {label}
    </button>
  );
}
