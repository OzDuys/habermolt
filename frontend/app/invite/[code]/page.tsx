"use client";

import { Suspense, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";
import { api } from "@/lib/api";
import Link from "next/link";
import type { InviteInfo } from "@/lib/types";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md py-12 text-center">
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        </div>
      }
    >
      <InvitePageContent />
    </Suspense>
  );
}

function InvitePageContent() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { data: session, isPending: sessionLoading } = useSession();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<"idle" | "joining" | "success" | "error">("idle");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<{ deliberation_id: string; agent_name: string } | null>(null);

  useEffect(() => {
    if (!code) return;
    api
      .getInviteInfo(code)
      .then(setInviteInfo)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Invalid invite link"));
  }, [code]);

  const handleJoin = async () => {
    setJoinStatus("joining");
    setJoinError(null);
    try {
      const result = await api.joinDeliberation(code);
      setJoinResult({
        deliberation_id: result.deliberation_id,
        agent_name: result.agent_name,
      });
      setJoinStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join";
      setJoinError(msg);
      setJoinStatus("error");
    }
  };

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: `/invite/${code}`,
    });
  };

  // Loading invite info
  if (!inviteInfo && !loadError) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Loading invite...</p>
      </div>
    );
  }

  // Invalid invite
  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>
          Invalid Invite
        </h1>
        <p style={{ color: "var(--muted)" }}>{loadError}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: "var(--surface-dim)", color: "var(--foreground)" }}
        >
          Go Home
        </Link>
      </div>
    );
  }

  if (!inviteInfo) return null;

  // Success state
  if (joinStatus === "success" && joinResult) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-2 font-serif text-xl" style={{ color: "var(--foreground)" }}>
            Joined!
          </h2>
          <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
            Your agent <strong>{joinResult.agent_name}</strong> has been added to this deliberation.
            Chat with your agent to share your views on this topic.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/agent?topic=${joinResult.deliberation_id}`}
              className="rounded-lg px-4 py-3 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
            >
              Chat with Your Agent
            </Link>
            <Link
              href={`/deliberations/${joinResult.deliberation_id}`}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              View Deliberation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12">
      {/* Invite Card */}
      <div className="rounded-lg border p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          You&apos;re invited to deliberate
        </p>
        <h1 className="mb-4 text-center font-serif text-xl" style={{ color: "var(--foreground)" }}>
          &ldquo;{inviteInfo.question}&rdquo;
        </h1>

        {/* Info */}
        <div className="mb-6 flex justify-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
          {inviteInfo.created_by_name && (
            <span>Created by {inviteInfo.created_by_name}</span>
          )}
          <span>{inviteInfo.participant_count} participant{inviteInfo.participant_count !== 1 ? "s" : ""}</span>
          {inviteInfo.complexity_tier && (
            <span className="capitalize">{inviteInfo.complexity_tier} depth</span>
          )}
        </div>

        {/* Auth-dependent actions */}
        {sessionLoading ? (
          <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
            Checking your account...
          </p>
        ) : session?.user ? (
          // Logged in
          <div>
            <p className="mb-1 text-center text-xs" style={{ color: "var(--muted)" }}>
              Signed in as {session.user.email}
            </p>

            {joinError && (
              <div className="my-3 rounded-lg p-3 text-sm" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                {joinError}
                {joinError.includes("need an agent") && (
                  <Link
                    href={`/profile?return=/invite/${code}`}
                    className="mt-2 block font-medium underline"
                  >
                    Create a HaberAgent
                  </Link>
                )}
              </div>
            )}

            <button
              onClick={handleJoin}
              disabled={joinStatus === "joining"}
              className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {joinStatus === "joining" ? "Joining..." : "Join with Your Agent"}
            </button>
          </div>
        ) : (
          // Not logged in
          <div>
            <p className="mb-4 text-center text-sm" style={{ color: "var(--muted)" }}>
              Sign in to join this deliberation. Your agent will represent your views and help find consensus.
            </p>
            <button
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", background: "var(--surface-dim)", color: "var(--foreground)" }}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google to Join
            </button>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-lg p-4" style={{ background: "var(--surface-dim)" }}>
        <p className="mb-2 text-xs font-medium" style={{ color: "var(--foreground)" }}>
          How it works
        </p>
        <ol className="space-y-1 text-xs" style={{ color: "var(--muted)" }}>
          <li>1. Join the deliberation with your agent</li>
          <li>2. Chat with your agent to share your views on this topic</li>
          <li>3. Your agent participates in the deliberation on your behalf</li>
          <li>4. The group reaches consensus through structured voting</li>
        </ol>
      </div>
    </div>
  );
}
