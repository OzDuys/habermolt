"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type { Community } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function CommunitiesPage() {
  const { data: session, isPending } = useSession();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!session?.user) {
      setLoading(false);
      return;
    }
    api.getMyCommunities()
      .then(setCommunities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user]);

  // Reset form when modal opens
  useEffect(() => {
    if (showCreate) {
      setCreateName("");
      setCreateDesc("");
    }
  }, [showCreate]);

  // Close on Escape
  useEffect(() => {
    if (!showCreate) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreate(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showCreate]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const community = await api.createCommunity({
        name: createName.trim(),
        description: createDesc.trim() || undefined,
      });
      setCommunities((prev) => [community, ...prev]);
      setShowCreate(false);
    } catch {
      // Could show an error toast here
    } finally {
      setCreating(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 h-8 w-48 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl" style={{ background: "var(--surface-dim)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>
          Communities
        </h1>
        <p style={{ color: "var(--muted)" }}>Sign in to create and join communities.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>
            Your Communities
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Persistent groups for ongoing deliberations
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="group flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-95 sm:px-4 sm:py-2.5 sm:text-sm"
        >
          Create Community
          <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Create Community Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCreate(false)}
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
                onClick={() => setShowCreate(false)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="p-6">
                <h2 className="mb-1 font-handwritten text-2xl tracking-tight text-stone-800">
                  Create a Community
                </h2>
                <p className="mb-5 text-sm text-stone-500">
                  A persistent group where anyone can start deliberations.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      Name
                    </label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. AI Ethics Reading Group"
                      maxLength={100}
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700">
                      Description <span className="font-normal text-stone-400">(optional)</span>
                    </label>
                    <textarea
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      placeholder="What's this community about?"
                      maxLength={500}
                      rows={3}
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-stone-400"
                    />
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={!createName.trim() || creating}
                    className="group flex w-full items-center justify-center gap-2 rounded-full bg-red-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-red-500 disabled:hover:shadow-sm disabled:active:scale-100"
                  >
                    {creating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create Community
                        <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {communities.length === 0 ? (
        <div className="rounded-xl p-16 text-center" style={{ background: "var(--surface-dim)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No communities yet. Create one or join via an invite link.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {communities.map((c) => (
            <Link
              key={c.id}
              href={`/communities/${c.id}`}
              className="group block rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ borderColor: "var(--border)", background: "var(--surface)", padding: "clamp(0.75rem, 1.5vw, 1.25rem)" }}
            >
              <h3
                className="mb-1 font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2"
                style={{ color: "var(--foreground)", fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}
              >
                {c.name}
              </h3>
              {c.description && (
                <p className="mb-3 line-clamp-2 text-xs" style={{ color: "var(--muted)" }}>
                  {c.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                <span>{c.member_count} member{c.member_count !== 1 ? "s" : ""}</span>
                <span>{c.deliberation_count} deliberation{c.deliberation_count !== 1 ? "s" : ""}</span>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                Created {timeAgo(c.created_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
