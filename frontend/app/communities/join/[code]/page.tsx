"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";
import { api } from "@/lib/api";
import Link from "next/link";
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

  // Load invite info
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

  // Accept invite and redirect
  const acceptAndRedirect = useCallback(async () => {
    if (!inviteInfo || !session?.user) return;
    setPageState("joining");
    try {
      let result;
      try {
        result = await api.joinCommunity(code);
      } catch (joinErr: any) {
        if (joinErr?.message?.includes("need an agent")) {
          await api.createDefaultAgent();
          result = await api.joinCommunity(code);
        } else {
          throw joinErr;
        }
      }
      router.replace(`/communities/${result.community_id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to join.");
      setPageState("error");
    }
  }, [inviteInfo, session, code, router]);

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: `/communities/join/${code}`,
    });
  };


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
    </div>
  );
}
