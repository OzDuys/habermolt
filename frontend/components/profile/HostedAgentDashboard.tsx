"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import TokenUsageBar from "@/components/TokenUsageBar";

const CONFIG_MODELS = [
  "google/gemini-3-flash-preview",
  "x-ai/grok-4.1-fast",
  "openai/gpt-5-mini",
];

const CONFIG_FREQUENCIES = [
  { value: "never", label: "Manual only" },
  { value: "two_hourly", label: "Every 2 hours" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Once a day" },
  { value: "weekly", label: "Once a week" },
];

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

interface SessionSummary {
  id: string;
  topic: string | null;
  message_count: number;
  created_at: string;
}

interface SessionMessage {
  role: string;
  content?: string;
  action?: string;
  status?: string;
  description?: string;
  detail?: string;
}


export default function HostedAgentDashboard() {
  const router = useRouter();
  const [agent, setAgent] = useState<HostedAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  // Dashboard state
  const [saving, setSaving] = useState(false);
  const [profileMarkdown, setProfileMarkdown] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState("");

  // Transcripts state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<SessionMessage[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  // Rebuild state
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMode, setRebuildMode] = useState(false);
  const [proposedProfile, setProposedProfile] = useState("");
  const [rebuildTab, setRebuildTab] = useState<"current" | "proposed">("proposed");

  useEffect(() => {
    fetchAgent();
  }, []);

  const fetchAgent = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backend/hosted-agents/me");
      if (res.status === 404) { setNotFound(true); return; }
      const data = await res.json();
      if (data.detail) { setError(data.detail); return; }
      setAgent(data);
      setNotFound(false);
      fetchProfile();
      fetchSessions();
    } catch { setError("Failed to load agent."); }
    finally { setLoading(false); }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/backend/hosted-agents/me/profile");
      if (res.ok) {
        const data = await res.json();
        setProfileMarkdown(data.profile_markdown || "");
      }
    } catch {}
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/backend/hosted-agents/me/chat/history");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {}
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/backend/hosted-agents/me/profile", {
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

  const toggleExpand = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    try {
      const res = await fetch(`/api/backend/hosted-agents/me/chat/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setExpandedMessages(data.messages || []);
      }
    } catch {}
  };

  const toggleSelect = (sessionId: string) => {
    setSelectedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSessions.size === sessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(sessions.map(s => s.id)));
    }
  };

  const handleDownloadSession = (sessionId: string) => {
    window.open(`/api/backend/hosted-agents/me/chat/${sessionId}/download`, "_blank");
  };

  const handleDownloadSelected = async () => {
    if (selectedSessions.size === 0) return;
    const res = await fetch("/api/backend/hosted-agents/me/chat/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_ids: Array.from(selectedSessions) }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcripts.md";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    setError("");
    try {
      const sessionIds = selectedSessions.size > 0 ? Array.from(selectedSessions) : [];
      const res = await fetch("/api/backend/hosted-agents/me/profile/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_ids: sessionIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Failed to rebuild profile.");
        return;
      }
      const data = await res.json();
      setProposedProfile(data.proposed_profile);
      setRebuildTab("proposed");
      setRebuildMode(false); // exit selection mode, show preview
    } catch {
      setError("Failed to rebuild profile. Please try again.");
    } finally {
      setRebuilding(false);
    }
  };

  const handleAcceptRebuild = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/backend/hosted-agents/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_markdown: proposedProfile }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfileMarkdown(data.profile_markdown);
        setProposedProfile("");
        setRebuildTab("proposed");
      }
    } catch {}
    finally { setSaving(false); }
  };

  const handleCancelRebuild = () => {
    setProposedProfile("");
    setRebuildMode(false);
  };

  const handleConfigUpdate = async (field: string, value: string | boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/backend/hosted-agents/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (res.ok) setAgent(data);
    } catch {}
    finally { setSaving(false); }
  };

  const handleDeleteAgent = async () => {
    if (!confirm("This will permanently delete your hosted agent. Continue?")) return;
    try {
      const res = await fetch("/api/backend/hosted-agents/me", { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.push("/settings");
        router.refresh();
      }
    } catch {}
  };

  if (loading) {
    return <HostedAgentDashboardSkeleton />;
  }

  if (notFound) return null;
  if (!agent) return null;

  const hasProposal = proposedProfile.length > 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold">Your HaberAgent</h2>
        <StatusBadge active={agent.is_active} reason={agent.paused_reason} />
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!agent.has_profile && (
        <div className="mb-6 rounded-xl border-2 border-dashed p-4" style={{ borderColor: "var(--accent)" }}>
          <p className="mb-2 font-medium">Chat with your agent</p>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            Your agent needs to learn about your values before it can participate in deliberations.
          </p>
          <a
            href="/agent-activity"
            className="inline-block rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
          >
            Start Chatting
          </a>
        </div>
      )}

      <div className="space-y-4">
        {/* Profile Section */}
        <Section title="Your Profile">
          {hasProposal ? (
            <div>
              <div className="mb-3 flex gap-1">
                <button
                  onClick={() => setRebuildTab("current")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-opacity ${rebuildTab === "current" ? "text-white" : ""}`}
                  style={{ background: rebuildTab === "current" ? "var(--accent)" : "var(--border)" }}
                >
                  Current
                </button>
                <button
                  onClick={() => setRebuildTab("proposed")}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-opacity ${rebuildTab === "proposed" ? "text-white" : ""}`}
                  style={{ background: rebuildTab === "proposed" ? "var(--accent)" : "var(--border)" }}
                >
                  Proposed
                </button>
              </div>
              {rebuildTab === "current" ? (
                <pre className="whitespace-pre-wrap text-xs" style={{ color: "var(--foreground)" }}>{profileMarkdown || "(empty)"}</pre>
              ) : (
                <textarea
                  value={proposedProfile}
                  onChange={(e) => setProposedProfile(e.target.value)}
                  className="w-full rounded-lg border p-3 font-mono text-xs"
                  style={{ borderColor: "var(--border)", background: "var(--background)", minHeight: "200px" }}
                  rows={14}
                />
              )}
              <div className="mt-2 flex gap-2">
                <button onClick={handleAcceptRebuild} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--accent)" }}>
                  {saving ? "Saving..." : "Accept Profile"}
                </button>
                <button onClick={handleCancelRebuild} className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                  Discard
                </button>
              </div>
            </div>
          ) : profileMarkdown ? (
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
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => { setProfileDraft(profileMarkdown); setEditingProfile(true); }}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={() => { setRebuildMode(true); setSelectedSessions(new Set(sessions.map(s => s.id))); }}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ borderColor: "var(--border)" }}
                    disabled={sessions.length === 0}
                  >
                    Rebuild from Transcripts
                  </button>
                </div>
              </div>
            )
          ) : (
            <div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>No profile yet. Chat with your agent to build your profile.</p>
              {sessions.length > 0 && (
                <button
                  onClick={() => { setRebuildMode(true); setSelectedSessions(new Set(sessions.map(s => s.id))); }}
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--border)" }}
                >
                  Rebuild from Transcripts
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Transcripts Section */}
        {sessions.length > 0 && (
          <Section title="Chat Transcripts">
            {/* Rebuild action bar */}
            {rebuildMode && (
              <div className="mb-3 flex items-center justify-between rounded-lg p-2" style={{ background: "var(--background)" }}>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {selectedSessions.size} of {sessions.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleRebuild}
                    disabled={rebuilding || selectedSessions.size === 0}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {rebuilding ? "Analyzing transcripts..." : `Rebuild from ${selectedSessions.size} transcript${selectedSessions.size !== 1 ? "s" : ""}`}
                  </button>
                  <button
                    onClick={() => { setRebuildMode(false); setSelectedSessions(new Set()); }}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ borderColor: "var(--border)" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {rebuildMode && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
                    <input
                      type="checkbox"
                      checked={selectedSessions.size === sessions.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                    Select all
                  </label>
                )}
              </div>
              {selectedSessions.size > 0 && !rebuildMode && (
                <button
                  onClick={handleDownloadSelected}
                  className="text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: "var(--accent)" }}
                >
                  Download selected ({selectedSessions.size})
                </button>
              )}
            </div>

            {/* Session list */}
            <div className="space-y-1">
              {sessions.map((s) => (
                <div key={s.id}>
                  <div
                    className="flex items-center gap-2 rounded-lg p-2 text-xs transition-colors hover:opacity-80 cursor-pointer"
                    style={{ background: expandedSession === s.id ? "var(--background)" : "transparent" }}
                  >
                    {rebuildMode && (
                      <input
                        type="checkbox"
                        checked={selectedSessions.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="rounded"
                      />
                    )}
                    <div className="flex-1" onClick={() => toggleExpand(s.id)}>
                      <span style={{ color: "var(--foreground)" }}>{s.topic || "General chat"}</span>
                      <span className="ml-2" style={{ color: "var(--muted)" }}>
                        {new Date(s.created_at).toLocaleDateString()} · {s.message_count} messages
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownloadSession(s.id); }}
                      className="text-xs transition-opacity hover:opacity-80"
                      style={{ color: "var(--muted)" }}
                      title="Download"
                    >
                      ↓
                    </button>
                  </div>
                  {expandedSession === s.id && (
                    <div className="ml-4 mb-2 rounded-lg border p-3 text-xs space-y-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                      {expandedMessages
                        .filter((m) => ((m.role === "user" || m.role === "assistant") && m.content) || m.role === "action")
                        .map((m, i) =>
                          m.role === "action" ? (
                            <div key={i} className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: "var(--background)", color: "var(--muted)" }}>
                              <span>{"✓"}</span>
                              <span>{m.action?.replace(/_/g, " ")}</span>
                              {m.description && <span>— {m.description}</span>}
                            </div>
                          ) : (
                            <div key={i}>
                              <span className="font-semibold" style={{ color: m.role === "user" ? "var(--accent)" : "var(--muted)" }}>
                                {m.role === "user" ? "You" : "Agent"}:
                              </span>{" "}
                              <span style={{ color: "var(--foreground)" }}>{m.content}</span>
                            </div>
                          )
                        )}
                      {expandedMessages.filter(m => ((m.role === "user" || m.role === "assistant") && m.content) || m.role === "action").length === 0 && (
                        <span style={{ color: "var(--muted)" }}>Empty session</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Weekly Token Usage">
          <TokenUsageBar used={agent.tokens_used_period} limit={agent.token_limit} tier={agent.pricing_tier} />
        </Section>

        <Section title="Settings">
          <Field label="Model">
            <select
              value={agent.model}
              onChange={(e) => handleConfigUpdate("model", e.target.value)}
              disabled={saving}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              {CONFIG_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Auto-heartbeat">
            <select
              value={agent.participation_frequency}
              onChange={(e) => handleConfigUpdate("participation_frequency", e.target.value)}
              disabled={saving}
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              {CONFIG_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => handleConfigUpdate("is_active", !agent.is_active)}
              disabled={saving}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {agent.is_active ? "Pause Agent" : "Resume Agent"}
            </button>
            <button
              onClick={handleDeleteAgent}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-red-600 transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--border)" }}
            >
              Delete Agent
            </button>
          </div>
        </Section>

        <Section title="Info">
          <Field label="Profile version">v{agent.profile_version}</Field>
          <Field label="Last heartbeat">{agent.last_heartbeat_at ? new Date(agent.last_heartbeat_at).toLocaleString() : "Never"}</Field>
          <Field label="Created">{new Date(agent.created_at).toLocaleDateString()}</Field>
        </Section>
      </div>
    </div>
  );
}

function HostedAgentDashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="h-6 w-40 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-6 w-16 animate-pulse rounded-full" style={{ background: "var(--surface-dim)" }} />
      </div>
      <div className="space-y-4">
        {/* Profile section */}
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Your Profile</h2>
          <div className="animate-pulse space-y-2">
            <div className="h-3 w-full rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="h-3 w-5/6 rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="h-3 w-4/6 rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="h-3 w-3/4 rounded" style={{ background: "var(--surface-dim)" }} />
          </div>
        </div>
        {/* Token usage section */}
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Weekly Token Usage</h2>
          <div className="h-4 w-full animate-pulse rounded-full" style={{ background: "var(--surface-dim)" }} />
        </div>
        {/* Settings section */}
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Settings</h2>
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-8 w-48 rounded-lg" style={{ background: "var(--surface-dim)" }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-8 w-36 rounded-lg" style={{ background: "var(--surface-dim)" }} />
            </div>
          </div>
        </div>
        {/* Info section */}
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Info</h2>
          <div className="animate-pulse space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-3 w-12 rounded" style={{ background: "var(--surface-dim)" }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-3 w-32 rounded" style={{ background: "var(--surface-dim)" }} />
            </div>
          </div>
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
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        {reason === "token_limit" ? "Token limit reached" : "Paused"}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
      Active
    </span>
  );
}
