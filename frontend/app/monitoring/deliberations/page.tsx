"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Deliberation {
  id: string;
  question: string;
  stage: string;
  mechanism_type: string;
  num_citizens: number;
  created_at: string;
}

export default function DeliberationsDebugPage() {
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deliberations")
      .then((r) => r.json())
      .then((data) => setDeliberations(data.deliberations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Deliberations Debug</h1>

      {deliberations.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--muted)" }}>No deliberations found</div>
      ) : (
        <div className="space-y-3">
          {deliberations.map((d) => (
            <Link
              key={d.id}
              href={`/monitoring/deliberations/${d.id}`}
              className="block p-4 rounded-xl border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-sm">{d.question}</h3>
                <div className="flex gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {d.stage}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    {d.mechanism_type}
                  </span>
                </div>
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {d.num_citizens} participants · {new Date(d.created_at).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
