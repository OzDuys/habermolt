"use client";

import { useEffect, useState } from "react";
import TokenUsageBar from "@/components/TokenUsageBar";
import { api } from "@/lib/api";
import type { Deliberation } from "@/lib/types";

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

  // Setup wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [deliberations, setDeliberations] = useState<Deliberation[]>([]);
  const [selectedDelibIds, setSelectedDelibIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupTier, setSetupTier] = useState("free");
  const [setupByokKey, setSetupByokKey] = useState("");
  const [delibSearch, setDelibSearch] = useState("");

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

  const fetchDeliberations = async () => {
    try {
      const delibs = await api.listDeliberations();
      setDeliberations(delibs);
    } catch {}
  };

  useEffect(() => {
    if (notFound && deliberations.length === 0) {
      fetchDeliberations();
    }
  }, [notFound]);

  const toggleDelib = (id: string) => {
    setSelectedDelibIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleCreate = async () => {
    if (!setupName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        display_name: setupName,
        pricing_tier: setupTier,
        selected_deliberation_ids: selectedDelibIds,
      };
      if (setupTier === "byok" && setupByokKey) body.byok_api_key = setupByokKey;
      const res = await fetch("/api/hosted-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Failed to create agent"); return; }
      setAgent(data);
      setNotFound(false);
      // Navigate to agent chat
      window.location.href = "/agent";
    } catch { setError("Failed to create agent."); }
    finally { setCreating(false); }
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

  // === SETUP WIZARD ===
  if (notFound) {
    return (
      <div>
        <h2 className="mb-2 text-xl font-bold">Create Your HaberAgent</h2>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Your agent will represent you in democratic deliberations. Let&apos;s start by picking topics you care about.
        </p>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>}

        {/* Step indicators */}
        <div className="mb-8 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${wizardStep >= s ? "text-white" : ""}`}
                style={{
                  background: wizardStep >= s ? "var(--accent)" : "var(--surface-dim, var(--border))",
                  color: wizardStep >= s ? "white" : "var(--muted)",
                }}
              >
                {s}
              </div>
              <span className="text-xs" style={{ color: wizardStep >= s ? "var(--foreground)" : "var(--muted)" }}>
                {s === 1 ? "Pick topics" : "Set up agent"}
              </span>
              {s < 2 && <div className="mx-2 h-px w-8" style={{ background: "var(--border)" }} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select deliberations */}
        {wizardStep === 1 && (
          <div>
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
              Choose 2-3 deliberations that interest you. Your first chat will be grounded in these topics.
            </p>
            <input
              type="text"
              value={delibSearch}
              onChange={(e) => setDelibSearch(e.target.value)}
              placeholder="Search deliberations..."
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            />
            <div className="mb-4 max-h-[400px] space-y-2 overflow-y-auto">
              {deliberations
                .filter((d) => d.question.toLowerCase().includes(delibSearch.toLowerCase()))
                .slice(0, 20)
                .map((d) => {
                  const selected = selectedDelibIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleDelib(d.id)}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${selected ? "ring-2 ring-[var(--accent)]" : ""}`}
                      style={{ borderColor: "var(--border)", background: selected ? "var(--surface)" : "transparent" }}
                    >
                      <div className="font-medium">{d.question}</div>
                      <div className="mt-1 flex gap-2">
                        {d.categories?.slice(0, 3).map((c) => (
                          <span key={c} className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--surface-dim, var(--border))" }}>{c}</span>
                        ))}
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {d.num_citizens} participant{d.num_citizens !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                  );
                })}
              {deliberations.length === 0 && (
                <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading deliberations...</div>
              )}
            </div>
            <button
              onClick={() => setWizardStep(2)}
              className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {selectedDelibIds.length > 0 ? `Continue with ${selectedDelibIds.length} topic${selectedDelibIds.length > 1 ? "s" : ""}` : "Skip — I\u2019ll pick later"}
            </button>
          </div>
        )}

        {/* Step 2: Name + Tier */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Your name</label>
              <input
                type="text"
                value={setupName}
                onChange={(e) => setSetupName(e.target.value)}
                placeholder="How your agent will refer to you"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Plan</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "free", label: "Free", desc: "50K tokens/mo" },
                  { value: "byok", label: "Bring Your Key", desc: "Unlimited" },
                  { value: "subscription", label: "Pro", desc: "500K tokens/mo" },
                ].map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSetupTier(t.value)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${setupTier === t.value ? "ring-2 ring-[var(--accent)]" : ""}`}
                    style={{ borderColor: "var(--border)", background: setupTier === t.value ? "var(--surface)" : "transparent" }}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {setupTier === "byok" && (
              <div>
                <label className="mb-1 block text-sm font-medium">OpenRouter API Key</label>
                <input
                  type="password"
                  value={setupByokKey}
                  onChange={(e) => setSetupByokKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setWizardStep(1)}
                className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--border)" }}
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !setupName.trim()}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {creating ? "Creating..." : "Create Agent & Start Chatting"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
