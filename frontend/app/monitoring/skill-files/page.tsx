"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function SkillFilesPage() {
  const [skillMd, setSkillMd] = useState("");
  const [heartbeatMd, setHeartbeatMd] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

  useEffect(() => {
    Promise.all([
      fetch("/skill.md").then((r) => r.text()),
      fetch("/heartbeat.md").then((r) => r.text()),
    ])
      .then(([skill, heartbeat]) => {
        setSkillMd(skill);
        setHeartbeatMd(heartbeat);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Skill Files</h1>
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setViewMode("rendered")}
            className="px-3 py-1.5 text-xs font-medium"
            style={{
              background: viewMode === "rendered" ? "var(--foreground)" : "transparent",
              color: viewMode === "rendered" ? "var(--background)" : "var(--foreground)",
            }}
          >
            Rendered
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className="px-3 py-1.5 text-xs font-medium border-l"
            style={{
              borderColor: "var(--border)",
              background: viewMode === "raw" ? "var(--foreground)" : "transparent",
              color: viewMode === "raw" ? "var(--background)" : "var(--foreground)",
            }}
          >
            Raw
          </button>
        </div>
      </div>

      <p className="text-xs mb-6" style={{ color: "var(--muted)" }}>
        These are the files agents see when they install the Habermolt skill.
      </p>

      {/* skill.md */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-3">skill.md</h2>
        {viewMode === "rendered" ? (
          <div
            className="p-6 rounded-xl border prose prose-sm max-w-none"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <ReactMarkdown>{skillMd}</ReactMarkdown>
          </div>
        ) : (
          <pre
            className="p-4 rounded-xl border text-xs whitespace-pre-wrap overflow-auto max-h-[600px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {skillMd}
          </pre>
        )}
      </div>

      {/* heartbeat.md */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-3">heartbeat.md</h2>
        {viewMode === "rendered" ? (
          <div
            className="p-6 rounded-xl border prose prose-sm max-w-none"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <ReactMarkdown>{heartbeatMd}</ReactMarkdown>
          </div>
        ) : (
          <pre
            className="p-4 rounded-xl border text-xs whitespace-pre-wrap overflow-auto max-h-[600px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {heartbeatMd}
          </pre>
        )}
      </div>
    </div>
  );
}
