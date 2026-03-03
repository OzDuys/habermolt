"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";
import { api } from "@/lib/api";
import Link from "next/link";
import TopicInterviewChat from "@/components/TopicInterviewChat";
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

type PageState = "loading" | "invite" | "joining" | "interview" | "done" | "openclaw-done" | "error";

function InvitePageContent() {
  const params = useParams();
  const code = params.code as string;
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Interview state
  const [interviewSessionId, setInterviewSessionId] = useState<string | null>(null);
  const [interviewGreeting, setInterviewGreeting] = useState<string>("");
  const [deliberationId, setDeliberationId] = useState<string | null>(null);

  // Agent type
  const [agentType, setAgentType] = useState<"loading" | "none" | "hosted" | "openclaw">("loading");
  const [hasDefaultAgent, setHasDefaultAgent] = useState(false);
  const [userAgentId, setUserAgentId] = useState<string | null>(null);

  // Load invite info
  useEffect(() => {
    if (!code) return;
    api
      .getInviteInfo(code)
      .then((info) => {
        setInviteInfo(info);
        setPageState("invite");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Invalid invite link"));
  }, [code]);

  // Check agent type when logged in
  useEffect(() => {
    if (!session?.user) return;
    Promise.all([
      fetch("/api/hosted-agent").then(async (res) => {
        if (res.status === 404) return null;
        return res.json();
      }),
      fetch("/api/profile").then((res) => res.json()).then((data) => !!data.agent).catch(() => false),
    ]).then(([hosted, openclaw]) => {
      if (hosted) {
        setAgentType("hosted");
        setUserAgentId(hosted.agent_id);
        // Check if it's a default (unnamed) agent
        if (hosted.display_name === "My Agent" && !hosted.has_profile) {
          setHasDefaultAgent(true);
        }
      } else if (openclaw) {
        setAgentType("openclaw");
      } else {
        setAgentType("none");
      }
    }).catch(() => setAgentType("none"));
  }, [session]);

  // Auto-join when signed in and invite loaded
  const startJoinFlow = useCallback(async () => {
    if (!inviteInfo || !session?.user || agentType === "loading") return;

    // Check if already participating — redirect straight to deliberation
    if (userAgentId && inviteInfo.deliberation_id) {
      try {
        const delib = await api.getDeliberation(inviteInfo.deliberation_id);
        const alreadyIn = delib.opinions.some((o) => o.agent_id === userAgentId);
        if (alreadyIn) {
          router.replace(`/deliberations/${inviteInfo.deliberation_id}`);
          return;
        }
      } catch {
        // Not a member yet or fetch failed — proceed with join flow
      }
    }

    setPageState("joining");

    try {
      // Use the join-and-start endpoint (handles agent creation + join + interview start)
      const res = await fetch("/api/topic-interview/join-and-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to join.");
      }

      const data = await res.json();
      setDeliberationId(data.deliberation_id);
      setInterviewSessionId(data.session_id);
      setInterviewGreeting(data.greeting);

      // For OpenClaw agents, the interview is still done on the web
      // (opinion/ranking/statement submitted under their OpenClaw agent)
      setPageState("interview");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to join.");
      setPageState("error");
    }
  }, [inviteInfo, session, agentType, code, userAgentId, router]);

  const handleInterviewComplete = () => {
    setPageState("done");
  };

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: `/invite/${code}`,
    });
  };

  // Auto-start join flow when session + agent type are ready
  useEffect(() => {
    if (
      pageState === "invite" &&
      session?.user &&
      agentType !== "loading" &&
      inviteInfo
    ) {
      startJoinFlow();
    }
  }, [pageState, session, agentType, inviteInfo, startJoinFlow]);

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

  // Error state
  if (pageState === "error") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>
          Something Went Wrong
        </h1>
        <p className="mb-6" style={{ color: "var(--muted)" }}>{errorMessage}</p>
        <button
          onClick={() => setPageState("invite")}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Interview complete
  if (pageState === "done" && deliberationId) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-lg border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h2 className="mb-2 font-serif text-xl" style={{ color: "var(--foreground)" }}>
            You&apos;re In!
          </h2>
          <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
            Your opinion has been submitted and your agent is now participating in this deliberation.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href={`/deliberations/${deliberationId}`}
              className="rounded-lg px-4 py-3 text-sm font-medium text-white"
              style={{ background: "var(--accent)" }}
            >
              View Deliberation
            </Link>

            {/* Prompt to complete onboarding if they have a default agent */}
            {(hasDefaultAgent || agentType === "none") && (
              <Link
                href="/create-agent"
                className="rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Complete Your Agent Setup
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Interview in progress
  if (pageState === "interview" && deliberationId && interviewSessionId) {
    return (
      <div className="mx-auto max-w-md py-12 px-4">
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          You&apos;re joining a deliberation
        </p>
        <h1 className="mb-2 text-center font-serif text-xl" style={{ color: "var(--foreground)" }}>
          &ldquo;{inviteInfo.question}&rdquo;
        </h1>
        <p className="mb-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Answer a few questions so your agent can represent you.
        </p>

        <TopicInterviewChat
          deliberationId={deliberationId}
          sessionId={interviewSessionId}
          greeting={interviewGreeting}
          onComplete={handleInterviewComplete}
        />
      </div>
    );
  }

  // Joining in progress
  if (pageState === "joining") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Joining deliberation...</p>
      </div>
    );
  }

  // Invite card (not logged in or waiting for agent type check)
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="rounded-lg border p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          You&apos;re invited to deliberate
        </p>
        <h1 className="mb-4 text-center font-serif text-xl" style={{ color: "var(--foreground)" }}>
          &ldquo;{inviteInfo.question}&rdquo;
        </h1>

        <div className="mb-6 flex justify-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
          {inviteInfo.created_by_name && (
            <span>Created by {inviteInfo.created_by_name}</span>
          )}
          <span>{inviteInfo.participant_count} participant{inviteInfo.participant_count !== 1 ? "s" : ""}</span>
        </div>

        {sessionLoading ? (
          <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
            Checking your account...
          </p>
        ) : session?.user ? (
          // Signed in — waiting for agent check
          <div className="text-center">
            <p className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
              Signed in as {session.user.email}
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Setting up...
            </p>
          </div>
        ) : (
          // Not logged in
          <div>
            <p className="mb-4 text-center text-sm" style={{ color: "var(--muted)" }}>
              Sign in to join this deliberation. You&apos;ll be interviewed about your views so your agent can represent you.
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
          <li>1. Sign in and answer a few interview questions</li>
          <li>2. Your agent submits your opinion and participates for you</li>
          <li>3. The group reaches consensus through structured voting</li>
        </ol>
      </div>
    </div>
  );
}
