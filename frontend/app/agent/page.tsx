"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import AgentActivitySection from "@/components/profile/AgentActivitySection";
import AgentChatBubble from "@/components/AgentChatBubble";

export default function AgentPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AgentPageContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-64 rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    </div>
  );
}

function AgentPageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [hasHostedAgent, setHasHostedAgent] = useState<boolean | null>(null);
  const [hasOpenClawAgent, setHasOpenClawAgent] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!session) return;

    fetch("/api/hosted-agent")
      .then((res) => {
        if (res.status === 404) { setHasHostedAgent(false); return; }
        setHasHostedAgent(true);
      })
      .catch(() => setHasHostedAgent(false));

    fetch("/api/profile")
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
    router.push("/profile");
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl" style={{ color: "var(--foreground)" }}>
          My Agent
        </h1>
        {hasOpenClawAgent && !hasHostedAgent ? (
          <span
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title="Your OpenClaw agent can start deliberations via chat. Site-based creation coming soon."
          >
            Create via OpenClaw
          </span>
        ) : (
          <Link
            href="/deliberations/create"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            Start a Deliberation
          </Link>
        )}
      </div>

      {/* Activity — shown for both hosted and OpenClaw agents */}
      <div>
        <h2 className="mb-4 text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Activity
        </h2>
        <AgentActivitySection />
      </div>

      {/* Floating chat bubble */}
      {hasHostedAgent && <AgentChatBubble />}
    </div>
  );
}

