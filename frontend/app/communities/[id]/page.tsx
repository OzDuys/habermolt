"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import CreateDeliberationModal from "@/components/CreateDeliberationModal";
import type { CommunityDetail, PrivateDeliberationListItem } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function CommunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const communityId = params.id as string;
  const { data: session, isPending } = useSession();

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [deliberations, setDeliberations] = useState<PrivateDeliberationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user || !communityId) return;

    Promise.all([
      api.getCommunityDetail(communityId),
      api.getMyPrivateDeliberations(),
    ])
      .then(([detail, privResp]) => {
        setCommunity(detail);
        const communityDelibs = privResp.deliberations.filter(
          (d) => d.community_id === communityId
        );
        setDeliberations(communityDelibs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load community"))
      .finally(() => setLoading(false));
  }, [session?.user, communityId]);

  const handleCopyInvite = () => {
    if (!community) return;
    const url = `${window.location.origin}/communities/join/${community.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await api.leaveCommunity(communityId);
      router.replace("/communities");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave community");
      setShowLeaveConfirm(false);
      setLeaving(false);
    }
  };

  const startEditing = () => {
    if (!community) return;
    setEditName(community.name);
    setEditDescription(community.description || "");
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!community) return;
    setSaving(true);
    try {
      const updated = await api.updateCommunity(communityId, {
        name: editName,
        description: editDescription || undefined,
      });
      setCommunity(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update community");
    } finally {
      setSaving(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-4 h-8 w-48 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="mb-8 h-4 w-64 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Sign in to view this community.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="mb-4" style={{ color: "var(--foreground)" }}>{error}</p>
        <Link href="/communities" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Back to Communities
        </Link>
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-2">
        <Link href="/communities" className="text-xs font-medium" style={{ color: "var(--muted)" }}>
          Communities
        </Link>
        <span className="mx-1 text-xs" style={{ color: "var(--muted)" }}>/</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 font-serif text-2xl sm:text-3xl"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
                maxLength={100}
              />
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
                maxLength={500}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--accent)" }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-stone-400"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>
                  {community.name}
                </h1>
                {community.my_role === "admin" && (
                  <button
                    onClick={startEditing}
                    className="rounded p-1 text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--muted)" }}
                    title="Edit community"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
              {community.description && (
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {community.description}
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {community.member_count} member{community.member_count !== 1 ? "s" : ""}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleCopyInvite}
            className="rounded-full border px-3 py-2 text-xs font-medium transition-colors hover:border-stone-400"
            style={{ borderColor: "var(--border)", color: copied ? "var(--accent)" : "var(--foreground)" }}
          >
            {copied ? "Copied!" : "Copy Invite Link"}
          </button>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="rounded-full border px-3 py-2 text-xs font-medium transition-colors hover:border-red-400 hover:text-red-500"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Members
        </h2>
        <div className="flex flex-wrap gap-2">
          {community.members.map((m) => (
            <span
              key={m.user_id}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {m.user_name || "Anonymous"}
              {m.role === "admin" && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>(admin)</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Deliberations header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          Deliberations
        </h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-95 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          Start a Deliberation
          <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {deliberations.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: "var(--surface-dim)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No deliberations yet. Start the first one!
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {deliberations.map((d) => (
            <Link
              key={d.id}
              href={`/deliberations/${d.id}`}
              className="group block rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ borderColor: "var(--border)", background: "var(--surface)", padding: "clamp(0.6rem, 1.5vw, 1rem)" }}
            >
              <h3
                className="mb-2 font-semibold leading-snug group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2"
                style={{ color: "var(--foreground)", fontSize: "clamp(0.75rem, 1.2vw, 0.9rem)" }}
              >
                {d.question}
              </h3>
              <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                <span>{d.participant_count} participant{d.participant_count !== 1 ? "s" : ""}</span>
                <span>{timeAgo(d.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateDeliberationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        communityId={communityId}
      />

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h3 className="mb-2 font-serif text-lg" style={{ color: "var(--foreground)" }}>Leave community?</h3>
            <p className="mb-5 text-sm" style={{ color: "var(--muted)" }}>
              You&apos;ll lose access to all community deliberations. You can rejoin later with an invite link.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-stone-400"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                disabled={leaving}
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ background: "#ef4444" }}
                disabled={leaving}
              >
                {leaving ? "Leaving..." : "Leave Community"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
