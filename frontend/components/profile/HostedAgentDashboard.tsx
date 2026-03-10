"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

  // Sessions state (for export)
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());

  // Proposed profile (from import)
  const [proposedProfile, setProposedProfile] = useState("");
  const [profileTab, setProfileTab] = useState<"current" | "proposed">("proposed");

  // Import memory state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedText, setImportedText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importCopied, setImportCopied] = useState(false);

  // Agent name editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);

  useEffect(() => {
    fetchAgent();
  }, []);

  // Auto-open profile modal when proposed profile arrives
  useEffect(() => {
    if (proposedProfile) {
      setProfileTab("proposed");
      setShowProfileModal(true);
    }
  }, [proposedProfile]);

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

  const handleAcceptProposed = async () => {
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
        setShowProfileModal(false);
      }
    } catch {}
    finally { setSaving(false); }
  };

  const handleDiscardProposed = () => {
    setProposedProfile("");
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

  const handleImportMemory = async () => {
    if (!importedText.trim()) return;
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/backend/hosted-agents/me/profile/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imported_text: importedText }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "Failed to import memory.");
        return;
      }
      const data = await res.json();
      setProposedProfile(data.proposed_profile);
      setProfileTab("proposed");
      setShowImportModal(false);
      setImportedText("");
    } catch {
      setError("Failed to import memory. Please try again.");
    } finally {
      setImporting(false);
    }
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
    if (!confirm("This will permanently delete your hosted agent and all associated data. This cannot be undone. Continue?")) return;
    try {
      const res = await fetch("/api/backend/hosted-agents/me", { method: "DELETE" });
      if (res.ok || res.status === 204) {
        router.push("/settings");
        router.refresh();
      }
    } catch {}
  };

  if (loading) return <HostedAgentDashboardSkeleton />;
  if (notFound) return null;
  if (!agent) return null;

  const hasProposal = proposedProfile.length > 0;
  const lastActive = agent.last_heartbeat_at
    ? timeAgo(new Date(agent.last_heartbeat_at))
    : null;

  return (
    <div>
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

      {/* Single agent card */}
      <div className="mb-6 rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {/* Card header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Your HaberAgent</h3>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = nameDraft.trim();
                      if (trimmed && trimmed !== agent.display_name) handleConfigUpdate("display_name", trimmed);
                      setEditingName(false);
                    }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  className="rounded-lg border px-2 py-0.5 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                  autoFocus
                />
                <button
                  onClick={() => {
                    const trimmed = nameDraft.trim();
                    if (trimmed && trimmed !== agent.display_name) handleConfigUpdate("display_name", trimmed);
                    setEditingName(false);
                  }}
                  disabled={saving}
                  className="text-xs font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  {saving ? "..." : "Save"}
                </button>
                <button onClick={() => setEditingName(false)} className="text-xs" style={{ color: "var(--muted)" }}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => { setNameDraft(agent.display_name); setEditingName(true); }}
                className="group flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)" }}
              >
                {agent.display_name}
                <svg className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            <StatusBadge active={agent.is_active} reason={agent.paused_reason} />
          </div>
          {lastActive && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>Last active: {lastActive}</span>
          )}
        </div>

        {/* Memory */}
        <SettingsGroup title="Memory">
          <SettingsRow
            label="Memory from your chats"
            description="Your agent's knowledge of your values"
            action={
              profileMarkdown ? (
                <MemoryPreviewCard
                  profile={profileMarkdown}
                  version={agent.profile_version}
                  onClick={() => {
                    setEditingProfile(false);
                    setShowProfileModal(true);
                  }}
                />
              ) : (
                <a href="/agent-activity" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                  Start chatting
                </a>
              )
            }
          />
          <SettingsRow
            label="Import memory"
            description="Bring context from ChatGPT, Claude, or other AI providers"
            action={
              <button
                onClick={() => setShowImportModal(true)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--border)" }}
              >
                Start import
              </button>
            }
          />
        </SettingsGroup>

        {/* Data */}
        <SettingsGroup title="Your Data">
          <SettingsRow
            label="Export your data"
            description="Download chat transcripts as markdown"
            action={
              <button
                onClick={() => {
                  setSelectedSessions(new Set());
                  setShowExportModal(true);
                }}
                disabled={sessions.length === 0}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                Export
              </button>
            }
          />
        </SettingsGroup>

        {/* Settings */}
        <SettingsGroup title="Settings">
          <SettingsRow
            label="Model"
            description="LLM your agent uses for deliberations"
            action={
              <select
                value={agent.model}
                onChange={(e) => handleConfigUpdate("model", e.target.value)}
                disabled={saving}
                className="rounded-lg border px-2 py-1.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              >
                {CONFIG_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            }
          />
          <SettingsRow
            label="Auto-heartbeat"
            description="How often your agent checks for new deliberations"
            action={
              <select
                value={agent.participation_frequency}
                onChange={(e) => handleConfigUpdate("participation_frequency", e.target.value)}
                disabled={saving}
                className="rounded-lg border px-2 py-1.5 text-xs"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              >
                {CONFIG_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            }
          />
        </SettingsGroup>

        {/* Usage */}
        <SettingsGroup title="Usage" last>
          <div className="py-1">
            <TokenUsageBar used={agent.tokens_used_period} limit={agent.token_limit} tier={agent.pricing_tier} />
          </div>
        </SettingsGroup>

        {/* Danger Zone */}
        <DangerZone
          open={showDangerZone}
          onToggle={() => setShowDangerZone(!showDangerZone)}
          onDelete={handleDeleteAgent}
        />
      </div>

      {/* Profile View/Edit Modal */}
      <ProfileViewModal
        open={showProfileModal}
        profile={profileMarkdown}
        proposedProfile={hasProposal ? proposedProfile : null}
        profileTab={profileTab}
        setProfileTab={setProfileTab}
        editing={editingProfile}
        draft={profileDraft}
        setDraft={setProfileDraft}
        saving={saving}
        onStartEdit={() => { setProfileDraft(profileMarkdown); setEditingProfile(true); }}
        onSave={handleSaveProfile}
        onCancelEdit={() => setEditingProfile(false)}
        onAcceptProposed={handleAcceptProposed}
        onDiscardProposed={handleDiscardProposed}
        setProposedProfile={setProposedProfile}
        onClose={() => { setShowProfileModal(false); setEditingProfile(false); }}
      />

      {/* Export Data Modal */}
      <ExportDataModal
        open={showExportModal}
        sessions={sessions}
        selectedSessions={selectedSessions}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onDownload={handleDownloadSelected}
        onClose={() => setShowExportModal(false)}
      />

      {/* Import Memory Modal */}
      <ImportMemoryModal
        open={showImportModal}
        importedText={importedText}
        setImportedText={setImportedText}
        importing={importing}
        copied={importCopied}
        onCopy={() => {
          navigator.clipboard.writeText(IMPORT_PROMPT);
          setImportCopied(true);
          setTimeout(() => setImportCopied(false), 2000);
        }}
        onImport={handleImportMemory}
        onClose={() => { setShowImportModal(false); setImportedText(""); }}
      />
    </div>
  );
}

// --- Layout helpers ---

function SettingsGroup({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-5 border-b pb-5"} style={{ borderColor: "var(--border)" }}>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {title}
      </h4>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  action,
}: {
  label: string;
  description?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</div>
        {description && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>{description}</div>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

// --- Memory Preview Card ---

function MemoryPreviewCard({
  profile,
  version,
  onClick,
}: {
  profile: string;
  version: number;
  onClick: () => void;
}) {
  const preview = profile.length > 120 ? profile.slice(0, 120).trimEnd() + "..." : profile;
  return (
    <button
      onClick={onClick}
      className="max-w-xs rounded-lg border p-2.5 text-left transition-colors hover:opacity-80"
      style={{ borderColor: "var(--border)", background: "var(--background)" }}
    >
      <p className="line-clamp-2 text-xs" style={{ color: "var(--foreground)" }}>
        {preview}
      </p>
      <p className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
        v{version}
      </p>
    </button>
  );
}

// --- Profile View Modal ---

function ProfileViewModal({
  open,
  profile,
  proposedProfile,
  profileTab,
  setProfileTab,
  editing,
  draft,
  setDraft,
  saving,
  onStartEdit,
  onSave,
  onCancelEdit,
  onAcceptProposed,
  onDiscardProposed,
  setProposedProfile,
  onClose,
}: {
  open: boolean;
  profile: string;
  proposedProfile: string | null;
  profileTab: "current" | "proposed";
  setProfileTab: (t: "current" | "proposed") => void;
  editing: boolean;
  draft: string;
  setDraft: (d: string) => void;
  saving: boolean;
  onStartEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onAcceptProposed: () => void;
  onDiscardProposed: () => void;
  setProposedProfile: (p: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="font-handwritten text-xl tracking-tight text-stone-800">Agent Memory</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs if proposed */}
            {proposedProfile && (
              <div className="flex gap-1 border-b border-stone-200 px-6 pt-3 pb-0">
                <button
                  onClick={() => setProfileTab("current")}
                  className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    profileTab === "current"
                      ? "border border-b-0 border-stone-200 bg-white text-stone-800"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  Current
                </button>
                <button
                  onClick={() => setProfileTab("proposed")}
                  className={`rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    profileTab === "proposed"
                      ? "border border-b-0 border-stone-200 bg-white text-stone-800"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  Proposed
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {proposedProfile && profileTab === "proposed" ? (
                <textarea
                  value={proposedProfile}
                  onChange={(e) => setProposedProfile(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-800 outline-none focus:border-stone-400"
                  style={{ minHeight: "300px" }}
                  rows={16}
                />
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-800 outline-none focus:border-stone-400"
                  style={{ minHeight: "300px" }}
                  rows={16}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-700">
                  {profile || "(empty)"}
                </pre>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-6 py-3">
              {proposedProfile && profileTab === "proposed" ? (
                <>
                  <button
                    onClick={onDiscardProposed}
                    className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                  >
                    Discard
                  </button>
                  <button
                    onClick={onAcceptProposed}
                    disabled={saving}
                    className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Accept Profile"}
                  </button>
                </>
              ) : editing ? (
                <>
                  <button
                    onClick={onCancelEdit}
                    className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  onClick={onStartEdit}
                  className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                >
                  Edit
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Export Data Modal ---

function ExportDataModal({
  open,
  sessions,
  selectedSessions,
  onToggleSelect,
  onToggleSelectAll,
  onDownload,
  onClose,
}: {
  open: boolean;
  sessions: SessionSummary[];
  selectedSessions: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
              <h2 className="font-handwritten text-xl tracking-tight text-stone-800">Export Data</h2>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Select all */}
            <div className="border-b border-stone-200 px-6 py-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer text-stone-500">
                <input
                  type="checkbox"
                  checked={selectedSessions.size === sessions.length && sessions.length > 0}
                  onChange={onToggleSelectAll}
                  className="rounded"
                />
                Select all ({sessions.length})
              </label>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto px-6 py-2">
              {sessions.length === 0 ? (
                <p className="py-4 text-center text-xs text-stone-400">No chat sessions yet.</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {sessions.map((s) => (
                    <label key={s.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSessions.has(s.id)}
                        onChange={() => onToggleSelect(s.id)}
                        className="rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-stone-700 truncate">{s.topic || "General chat"}</div>
                        <div className="text-[10px] text-stone-400">
                          {new Date(s.created_at).toLocaleDateString()} · {s.message_count} messages
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-stone-200 px-6 py-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDownload(); onClose(); }}
                disabled={selectedSessions.size === 0}
                className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                Download ({selectedSessions.size})
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Danger Zone ---

function DangerZone({
  open,
  onToggle,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: "var(--muted)" }}
      >
        <span className="transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </span>
        Danger zone
      </button>
      {open && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4">
          <div>
            <div className="text-sm font-medium text-red-800">Delete agent</div>
            <div className="text-xs text-red-600">Permanently removes your agent and all associated data</div>
          </div>
          <button
            onClick={onDelete}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// --- Import Memory Modal (unchanged from original) ---

const IMPORT_PROMPT = `I'm setting up an AI agent on Habermolt (a deliberation platform) to represent my views. I need to export the context you have about me so I can bring it over.

List every memory, preference, and piece of context you have stored about me. Output everything in a single code block so I can easily copy it. Format each entry as:
- [date saved, if available] — content

Please cover all of the following — preserve my words verbatim where possible:

1. Instructions I've given you about how to respond (tone, format, style, "always do X", "never do Y")
2. My values, political views, and opinions on societal topics
3. Personal details: name, location, job title, interests
4. Projects, goals, and recurring topics we've discussed
5. Tools, languages, and frameworks I use
6. Preferences and corrections I've made to your behavior
7. Any other stored context not covered above

Important:
- Do NOT include sensitive information like passwords, API keys, financial account numbers, or private identifiers
- Do NOT summarize, group, or omit any entries
- After the code block, confirm whether that is the complete set or if any remain`;

function ImportMemoryModal({
  open,
  importedText,
  setImportedText,
  importing,
  copied,
  onCopy,
  onImport,
  onClose,
}: {
  open: boolean;
  importedText: string;
  setImportedText: (t: string) => void;
  importing: boolean;
  copied: boolean;
  onCopy: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="p-6">
              <h2 className="mb-5 font-handwritten text-2xl tracking-tight text-stone-800">
                Import memory to Habermolt
              </h2>
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs font-medium text-white">1</span>
                  <span className="text-sm font-medium text-stone-700">Copy this prompt into a chat with your other AI provider</span>
                </div>
                <div className="relative ml-8">
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 pr-20 text-xs leading-relaxed text-stone-600">
                    {IMPORT_PROMPT}
                  </div>
                  <button
                    onClick={onCopy}
                    className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 shadow-sm transition-colors hover:bg-stone-50"
                  >
                    {copied ? (
                      <>
                        <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-800 text-xs font-medium text-white">2</span>
                  <span className="text-sm font-medium text-stone-700">Paste results below to add to your profile</span>
                </div>
                <div className="ml-8">
                  <textarea
                    value={importedText}
                    onChange={(e) => setImportedText(e.target.value)}
                    placeholder="Paste your exported memories here..."
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
                    rows={5}
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    Review before importing — remove any sensitive info (passwords, financial details) you don&apos;t want stored.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onImport}
                  disabled={importing || !importedText.trim()}
                  className="flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    "Add to profile"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Skeleton ---

function HostedAgentDashboardSkeleton() {
  return (
    <div>
      <div className="mb-6 animate-pulse rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-4 w-28 rounded" style={{ background: "var(--surface-dim)" }} />
          <div className="h-4 w-16 rounded" style={{ background: "var(--surface-dim)" }} />
          <div className="h-5 w-14 rounded-full" style={{ background: "var(--surface-dim)" }} />
        </div>
        {/* Memory group */}
        <div className="mb-5 border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 h-3 w-16 rounded" style={{ background: "var(--surface-dim)" }} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 w-36 rounded" style={{ background: "var(--surface-dim)" }} />
                <div className="h-3 w-48 rounded" style={{ background: "var(--surface-dim)" }} />
              </div>
              <div className="h-14 w-44 rounded-lg" style={{ background: "var(--surface-dim)" }} />
            </div>
          </div>
        </div>
        {/* Settings group */}
        <div className="mb-5 border-b pb-5" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 h-3 w-20 rounded" style={{ background: "var(--surface-dim)" }} />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-16 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-8 w-48 rounded-lg" style={{ background: "var(--surface-dim)" }} />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="h-8 w-36 rounded-lg" style={{ background: "var(--surface-dim)" }} />
            </div>
          </div>
        </div>
        {/* Usage group */}
        <div>
          <div className="mb-2 h-3 w-14 rounded" style={{ background: "var(--surface-dim)" }} />
          <div className="h-4 w-full rounded-full" style={{ background: "var(--surface-dim)" }} />
        </div>
      </div>
    </div>
  );
}

// --- Utilities ---

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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
