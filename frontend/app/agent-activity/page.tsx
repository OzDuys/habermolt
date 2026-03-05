"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import AgentActivitySection from "@/components/profile/AgentActivitySection";
import AgentChatBubble from "@/components/AgentChatBubble";
import CreateDeliberationModal from "@/components/CreateDeliberationModal";

export default function AgentPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AgentPageContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        <div className="h-10 w-48 animate-pulse rounded-full" style={{ background: "var(--surface-dim)" }} />
      </div>

      {/* Stats bar skeleton */}
      <div
        className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4"
        style={{ borderColor: "var(--border)", background: "var(--border)" }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center py-3" style={{ background: "var(--surface)" }}>
            <div className="h-6 w-8 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
            <div className="mt-2 h-2 w-20 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
          </div>
        ))}
      </div>

      {/* Deliberation cards skeleton */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-3/4 rounded" style={{ background: "var(--surface-dim)" }} />
              <div className="flex gap-1">
                <div className="h-3 w-12 rounded-full" style={{ background: "var(--surface-dim)" }} />
                <div className="h-3 w-16 rounded-full" style={{ background: "var(--surface-dim)" }} />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded" style={{ background: "var(--surface-dim)" }} />
                <div className="h-3 w-2/3 rounded" style={{ background: "var(--surface-dim)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [hasHostedAgent, setHasHostedAgent] = useState<boolean | null>(null);
  const [hasOpenClawAgent, setHasOpenClawAgent] = useState<boolean | null>(null);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) return;

    fetch("/api/backend/hosted-agents/me")
      .then(async (res) => {
        if (res.status === 404) { setHasHostedAgent(false); return; }
        setHasHostedAgent(true);
        const data = await res.json();
        setIsOnboarded(!!data.onboarded);
      })
      .catch(() => setHasHostedAgent(false));

    fetch("/api/backend/agents/me")
      .then((res) => res.json())
      .then((data) => { setHasOpenClawAgent(!!data.agent); })
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  if (isPending) {
    return <LoadingSkeleton />;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg py-20 px-4 text-center">
        <div className="mb-6 text-5xl">&#x1F916;</div>
        <h1 className="mb-3 font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
          Your personal AI agent that participates in deliberations on your behalf.
        </p>
        <p className="mb-8 text-sm" style={{ color: "var(--muted)" }}>
          Chat with your agent to teach it your values and preferences, then it will autonomously join deliberations, submit opinions, rank consensus statements, and even propose new ones — all based on what it learns from you.
        </p>
        <a
          href="/sign-in"
          className="inline-block rounded-lg px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Sign in to get started
        </a>
      </div>
    );
  }

  if (hasHostedAgent === null || hasOpenClawAgent === null) {
    return <LoadingSkeleton />;
  }

  if (!hasHostedAgent && !hasOpenClawAgent) {
    router.push("/settings");
    return <LoadingSkeleton />;
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-95"
          style={{ padding: "clamp(0.4rem, 0.7vw, 0.625rem) clamp(0.5rem, 1vw, 0.75rem) clamp(0.4rem, 0.7vw, 0.625rem) clamp(0.85rem, 1.4vw, 1.25rem)", fontSize: "clamp(0.65rem, 1.1vw, 0.875rem)" }}
        >
          Start a Deliberation
          <svg className="transition-transform group-hover:rotate-90" style={{ width: "clamp(0.85rem, 1.4vw, 1.125rem)", height: "clamp(0.85rem, 1.4vw, 1.125rem)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Prompt to finish onboarding for GuestAgent users */}
      {hasHostedAgent && !isOnboarded && (
        <Link
          href="/create-agent"
          className="mb-6 flex items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:border-orange-400"
          style={{ borderColor: "rgba(200,74,32,0.3)", background: "rgba(200,74,32,0.04)" }}
        >
          <span className="text-2xl">&#x1F99E;</span>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Finish setting up your agent
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Give it a name and teach it your values so it can better represent you in deliberations.
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: "#c84a20" }}>Set up &rarr;</span>
        </Link>
      )}

      {/* Activity — shown for both hosted and OpenClaw agents */}
      <AgentActivitySection />

      {/* Floating chat bubble */}
      {hasHostedAgent && <AgentChatBubble />}

      <CreateDeliberationModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
}
