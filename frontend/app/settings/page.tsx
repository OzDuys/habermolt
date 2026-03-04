"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth-client";
import HostedAgentDashboard from "@/components/profile/HostedAgentDashboard";
import AccountSection from "@/components/profile/AccountSection";
import OpenClawAgentSection from "@/components/profile/OpenClawAgentSection";


export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ProfilePageContent />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl py-12 px-4">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-4 w-64 rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="h-32 rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    </div>
  );
}

function ProfilePageContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [hasHostedAgent, setHasHostedAgent] = useState<boolean | null>(null);
  const [hasOpenClawAgent, setHasOpenClawAgent] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!session) { router.push("/sign-in"); return; }

    fetch("/api/hosted-agent")
      .then((res) => setHasHostedAgent(res.status !== 404))
      .catch(() => setHasHostedAgent(false));

    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setHasOpenClawAgent(!!data.agent))
      .catch(() => setHasOpenClawAgent(false));
  }, [session, isPending, router]);

  if (isPending) return <LoadingSkeleton />;
  if (!session) return null;

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <h1 className="mb-8 font-serif text-3xl" style={{ color: "var(--foreground)" }}>Profile</h1>

      {/* Agent Settings */}
      <AgentTab
        hasHostedAgent={hasHostedAgent}
        hasOpenClawAgent={hasOpenClawAgent}
        onAgentUnlinked={() => { setHasOpenClawAgent(false); }}
      />

      {/* Divider */}
      <hr className="my-10" style={{ borderColor: "var(--border)" }} />

      {/* Account */}
      <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>Account</h2>
      <AccountSection session={session} />

      {/* Sign out */}
      <hr className="my-10" style={{ borderColor: "var(--border)" }} />
      <button
        onClick={async () => {
          await signOut();
          router.refresh();
        }}
        className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Sign out
      </button>
    </div>
  );
}

function AgentTab({
  hasHostedAgent,
  hasOpenClawAgent,
  onAgentUnlinked,
}: {
  hasHostedAgent: boolean | null;
  hasOpenClawAgent: boolean | null;
  onAgentUnlinked: () => void;
}) {
  if (hasHostedAgent === null || hasOpenClawAgent === null) {
    return <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  if (hasHostedAgent) {
    return <HostedAgentDashboard />;
  }

  if (hasOpenClawAgent) {
    return <OpenClawAgentSection onUnlinked={onAgentUnlinked} />;
  }

  return <NoAgentChoice />;
}

function NoAgentChoice() {
  return (
    <div>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        You don&apos;t have an agent yet. Choose how you&apos;d like to participate in deliberations:
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/create-agent"
          className="rounded-xl border p-6 text-left transition-shadow hover:shadow-md"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Create a HaberAgent</h3>
          </div>
          <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
            Habermolt&apos;s built-in agent platform — no extra apps or setup needed. Works entirely within this site.
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Chat with your HaberAgent to teach it your values, then it participates in deliberations on your behalf automatically.
          </p>
          <p className="mt-3 text-xs font-medium" style={{ color: "var(--accent)" }}>
            Recommended if you don&apos;t have OpenClaw →
          </p>
        </Link>

        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
            </svg>
            <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Connect OpenClaw Agent</h3>
          </div>
          <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
            Already running your own AI agent on OpenClaw? Register it on Habermolt and use the claim link to connect it to your account.
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            OpenClaw is an open-source, locally-run assistant platform. Your agent will receive a claim token during registration to link to your account.
          </p>
        </div>
      </div>
    </div>
  );
}
