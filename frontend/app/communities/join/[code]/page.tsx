"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import Link from "next/link";
import SignInModal, { consumeSignInIntent } from "@/components/SignInModal";
import type { CommunityInviteInfo } from "@/lib/types";

type PageState = "loading" | "invite" | "joining" | "error";

export default function CommunityJoinPage() {
  const params = useParams();
  const code = params.code as string;
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [inviteInfo, setInviteInfo] = useState<CommunityInviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const autoJoinTriggered = useRef(false);

  // Load invite info + check if already a member
  useEffect(() => {
    if (!code) return;
    api
      .getCommunityInviteInfo(code)
      .then((info) => {
        setInviteInfo(info);
        setPageState("invite");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Invalid invite link"));
  }, [code]);

  // Auto-redirect if already a member
  useEffect(() => {
    if (!session?.user || !inviteInfo || sessionLoading) return;
    api.getMyCommunities().then((communities) => {
      const match = communities.find((c) => c.id === String(inviteInfo.community_id));
      if (match) {
        router.replace(`/communities/${match.id}`);
      }
    }).catch(() => {});
  }, [session?.user, inviteInfo, sessionLoading, router]);

  // Accept invite and redirect
  const acceptAndRedirect = useCallback(async () => {
    if (!inviteInfo || !session?.user) return;
    setPageState("joining");
    try {
      const result = await api.joinCommunity(code);
      router.replace(`/communities/${result.community_id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to join.");
      setPageState("error");
    }
  }, [inviteInfo, session, code, router]);

  // Auto-join after sign-in redirect (intent was set before OAuth/email sign-in)
  useEffect(() => {
    if (!session?.user || !inviteInfo || autoJoinTriggered.current) return;
    const intent = consumeSignInIntent();
    if (intent === `community-join-${code}`) {
      autoJoinTriggered.current = true;
      acceptAndRedirect();
    }
  }, [session?.user, inviteInfo, code, acceptAndRedirect]);

  // Loading
  if (!inviteInfo && !loadError) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="mb-4 mx-auto h-8 w-48 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
        <div className="mx-auto h-4 w-64 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
      </div>
    );
  }

  // Invalid invite
  if (loadError) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>Invalid Invite</h1>
        <p style={{ color: "var(--muted)" }}>{loadError}</p>
        <Link href="/" className="mt-6 inline-block rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "var(--surface-dim)", color: "var(--foreground)" }}>
          Go Home
        </Link>
      </div>
    );
  }

  if (!inviteInfo) return null;

  // Error
  if (pageState === "error") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>Something Went Wrong</h1>
        <p className="mb-6" style={{ color: "var(--muted)" }}>{errorMessage}</p>
        <button onClick={() => setPageState("invite")} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
          Try Again
        </button>
      </div>
    );
  }

  // Joining
  if (pageState === "joining") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Joining community...</p>
      </div>
    );
  }

  // Invite card
  return (
    <div className="mx-auto max-w-md py-12">
      <div className="rounded-lg border p-8" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          You&apos;re invited to join
        </p>
        <h1 className="mb-2 text-center font-serif text-xl" style={{ color: "var(--foreground)" }}>
          {inviteInfo.name}
        </h1>
        {inviteInfo.description && (
          <p className="mb-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            {inviteInfo.description}
          </p>
        )}
        <div className="mb-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          {inviteInfo.member_count} member{inviteInfo.member_count !== 1 ? "s" : ""}
        </div>

        {sessionLoading ? (
          <p className="text-center text-sm" style={{ color: "var(--muted)" }}>Checking your account...</p>
        ) : session?.user ? (
          <div className="text-center">
            <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>Signed in as {session.user.email}</p>
            <button
              onClick={acceptAndRedirect}
              className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Join {inviteInfo.name}
            </button>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-center text-sm" style={{ color: "var(--muted)" }}>
              Sign in to join this community and participate in its deliberations.
            </p>
            <button
              onClick={() => setSignInOpen(true)}
              className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Sign in to Join
            </button>
          </div>
        )}
      </div>

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} intent={`community-join-${code}`} />
    </div>
  );
}
