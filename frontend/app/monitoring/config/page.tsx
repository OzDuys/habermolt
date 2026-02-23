"use client";

import { useEffect, useState } from "react";

interface Config {
  [key: string]: string | number | boolean | string[];
}

interface Prompt {
  name: string;
  description: string;
  content: string;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/monitoring/config", { headers: { "X-Monitoring-Secret": getSecret() } }).then((r) => r.json()),
      fetch("/api/monitoring/prompts", { headers: { "X-Monitoring-Secret": getSecret() } }).then((r) => r.json()),
    ])
      .then(([configData, promptsData]) => {
        setConfig(configData);
        setPrompts(promptsData.prompts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Configuration & Prompts</h1>

      {/* Configuration */}
      {config && (
        <div className="mb-10">
          <h2 className="text-lg font-bold mb-4">System Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(config).map(([key, value]) => (
              <div
                key={key}
                className="p-3 rounded-lg border"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div
                  className="text-[10px] font-medium uppercase tracking-wider mb-1"
                  style={{ color: "var(--muted)" }}
                >
                  {key}
                </div>
                <div className="font-mono text-xs break-all">
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompts */}
      {prompts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">System Prompts</h2>
          <div className="space-y-6">
            {prompts.map((prompt, i) => (
              <div key={i}>
                <div className="mb-2">
                  <h3 className="text-sm font-bold">{prompt.name}</h3>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {prompt.description}
                  </p>
                </div>
                <pre
                  className="p-4 rounded-lg border text-xs whitespace-pre-wrap overflow-auto max-h-[500px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {prompt.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
