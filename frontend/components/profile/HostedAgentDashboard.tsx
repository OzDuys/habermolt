"use client";

import { useEffect, useState } from "react";
import TokenUsageBar from "@/components/TokenUsageBar";

interface HostedAgent {
  id: string;
  display_name: string;
  model: string;
  participation_frequency: string;
  pricing_tier: string;
  is_active: boolean;
  paused_reason: string | null;
  has_profile: boolean;
  profile_version: number;
  tokens_used_period: number;
  token_limit: number | null;
  last_heartbeat_at: string | null;
  created_at: string;
}


const MODELS = [
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-4.1-mini",
  "deepseek/deepseek-v3.2",
];

const FREQUENCIES = [
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Once a day" },
  { value: "weekly", label: "Once a week" },
];

export default function HostedAgentDashboard({ onDeleted }: { onDeleted?: () => void }) {
  const [agent, setAgent] = useState<HostedAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  // Dashboard state
  const [saving, setSaving] = useState(false);
  const [profileMarkdown, setProfileMarkdown] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState("");
  useEffect(() => {
    fetchAgent();
  }, []);

  const fetchAgent = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hosted-agent");
      if (res.status === 404) { setNotFound(true); return; }
      const data = await res.json();
      if (data.detail) { setError(data.detail); return; }
      setAgent(data);
      setNotFound(false);
      fetchProfile();
    } catch { setError("Failed to load agent."); }
    finally { setLoading(false); }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/hosted-agent/profile");
      if (res.ok) {
        const data = await res.json();
        setProfileMarkdown(data.profile_markdown || "");
      }
    } catch {}
  };

  const handleUpdate = async (field: string, value: string | boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/hosted-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (res.ok) setAgent(data);
    } catch {}
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("This will permanently delete your hosted agent. Continue?")) return;
    try {
      const res = await fetch("/api/hosted-agent", { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        setError("Failed to delete agent. Please try again.");
        return;
      }
      setAgent(null);
      setNotFound(true);
      onDeleted?.();
    } catch {
      setError("Failed to delete agent. Please try again.");
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/hosted-agent/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_markdown: profileDraft }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfileMarkdown(data.profile_markdown);
        setEditingProfile(false);
      }
    } catch {}
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  // Agent creation now happens at /create-agent
  if (notFound) return null;

  if (!agent) return null;

  // === AGENT DASHBOARD ===
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Your HaberAgent</h2>
        <StatusBadge active={agent.is_active} reason={agent.paused_reason} />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>}

      {!agent.has_profile && (
        <div className="mb-6 rounded-xl border-2 border-dashed p-4" style={{ borderColor: "var(--accent)" }}>
          <p className="mb-2 font-medium">Chat with your agent</p>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            Your agent needs to learn about your values before it can participate in deliberations.
          </p>
          <a
            href="/agent"
            className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            Start Chatting
          </a>
        </div>
      )}

      <div className="space-y-4">
        <Section title="Your Profile">
          {profileMarkdown ? (
            editingProfile ? (
              <div>
                <textarea
                  value={profileDraft}
                  onChange={(e) => setProfileDraft(e.target.value)}
                  className="w-full rounded-lg border p-3 font-mono text-xs"
                  style={{ borderColor: "var(--border)", background: "var(--background)", minHeight: "200px" }}
                  rows={12}
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={handleSaveProfile} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--accent)" }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditingProfile(false)} className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--foreground)" }}>{profileMarkdown}</pre>
                <button
                  onClick={() => { setProfileDraft(profileMarkdown); setEditingProfile(true); }}
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--border)" }}
                >
                  Edit Profile
                </button>
              </div>
            )
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>No profile yet. Chat with your agent to build your profile.</p>
          )}
        </Section>

        <Section title="Configuration">
          <Field label="Name">{agent.display_name}</Field>
          <Field label="Model">
            <select
              value={agent.model}
              onChange={(e) => handleUpdate("model", e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Frequency">
            <select
              value={agent.participation_frequency}
              onChange={(e) => handleUpdate("participation_frequency", e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Tier">
            <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase" style={{ background: "var(--surface-dim, var(--border))" }}>
              {agent.pricing_tier}
            </span>
          </Field>
        </Section>

        <Section title="Token Usage">
          <TokenUsageBar used={agent.tokens_used_period} limit={agent.token_limit} tier={agent.pricing_tier} />
        </Section>

        <Section title="Info">
          <Field label="Profile version">v{agent.profile_version}</Field>
          <Field label="Last heartbeat">{agent.last_heartbeat_at ? new Date(agent.last_heartbeat_at).toLocaleString() : "Never"}</Field>
          <Field label="Created">{new Date(agent.created_at).toLocaleDateString()}</Field>
        </Section>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => handleUpdate("is_active", !agent.is_active)}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ borderColor: "var(--border)" }}
            disabled={saving}
          >
            {agent.is_active ? "Pause Agent" : "Resume Agent"}
          </button>
          <button
            onClick={handleDelete}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium text-red-600 transition-opacity hover:opacity-80 dark:text-red-400"
            style={{ borderColor: "var(--border)" }}
          >
            Delete Agent
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function StatusBadge({ active, reason }: { active: boolean; reason: string | null }) {
  if (!active) {
    return (
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
        {reason === "token_limit" ? "Token limit reached" : "Paused"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
      Active
    </span>
  );
}
