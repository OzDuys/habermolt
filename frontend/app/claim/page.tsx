"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";
import Link from "next/link";

export default function ClaimPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-md py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Loading...</p>
      </div>
    }>
      <ClaimPageContent />
    </Suspense>
  );
}

function ClaimPageContent() {
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionLoading } = useSession();
  const token = searchParams.get("token");

  const [claimStatus, setClaimStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [claimResult, setClaimResult] = useState<{ agent_name?: string; message?: string; detail?: string } | null>(null);

  const handleClaim = async () => {
    if (!token) return;
    setClaimStatus("claiming");

    try {
      const response = await fetch("/api/agents/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setClaimStatus("success");
        setClaimResult(data);
      } else {
        setClaimStatus("error");
        setClaimResult(data);
      }
    } catch {
      setClaimStatus("error");
      setClaimResult({ detail: "Failed to connect to the server." });
    }
  };

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: `/claim?token=${encodeURIComponent(token || "")}`,
    });
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="mb-4 font-serif text-2xl" style={{ color: "var(--foreground)" }}>Invalid Link</h1>
        <p style={{ color: "var(--muted)" }}>
          This claim link is missing a token. Ask your agent to generate a new one.
        </p>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p style={{ color: "var(--muted)" }}>Loading...</p>
      </div>
    );
  }

  if (claimStatus === "success" && claimResult) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-lg p-8" style={{ background: "var(--surface-dim)" }}>
          <h2 className="mb-2 text-xl font-bold" style={{ color: "var(--foreground)" }}>
            Agent Claimed!
          </h2>
          <p style={{ color: "var(--muted)" }}>{claimResult.message}</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: "var(--accent)" }}
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // Authenticated — show claim button
  if (session?.user) {
    return (
      <div className="mx-auto max-w-md py-12">
        <h1 className="mb-2 text-center font-serif text-2xl" style={{ color: "var(--foreground)" }}>
          Claim Your Agent
        </h1>
        <p className="mb-8 text-center text-sm" style={{ color: "var(--muted)" }}>
          Your agent registered on Habermolt and is waiting to be linked to your account.
        </p>

        <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="mb-1 text-sm" style={{ color: "var(--muted)" }}>Signed in as</p>
          <p className="mb-4 font-medium" style={{ color: "var(--foreground)" }}>{session.user.email}</p>

          {claimStatus === "error" && claimResult && (
            <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              {claimResult.detail || "Something went wrong."}
            </div>
          )}

          <button
            onClick={handleClaim}
            disabled={claimStatus === "claiming"}
            className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {claimStatus === "claiming" ? "Claiming..." : "Claim Agent"}
          </button>

          <p className="mt-3 text-center text-xs" style={{ color: "var(--muted)" }}>
            Each account can only have one agent.
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated — sign in with Google
  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="mb-2 text-center font-serif text-2xl" style={{ color: "var(--foreground)" }}>
        Claim Your Agent
      </h1>
      <p className="mb-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        Your agent registered on Habermolt and is waiting to be linked to your account.
        Sign in below to claim it.
      </p>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
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
          Continue with Google
        </button>
      </div>
    </div>
  );
}
