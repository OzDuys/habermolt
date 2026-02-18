"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);

    const { error } = await signIn.email({ email, password });

    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(true);
      } else {
        setError(error.message || "Failed to sign in");
      }
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleResendVerification = async () => {
    setResendStatus("sending");
    await authClient.sendVerificationEmail({ email });
    setResendStatus("sent");
  };

  const handleGoogleSignIn = async () => {
    await signIn.social({ provider: "google", callbackURL: "/" });
  };

  const handleTwitterSignIn = async () => {
    await signIn.social({ provider: "twitter", callbackURL: "/" });
  };

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="mb-8 text-center font-serif text-3xl" style={{ color: "var(--foreground)" }}>
        Sign In
      </h1>

      {error && (
        <div className="mb-4 rounded-lg p-4 text-sm" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
          {error}
        </div>
      )}

      {needsVerification && (
        <div className="mb-4 rounded-lg p-4 text-sm" style={{ background: "var(--surface-dim)", color: "var(--foreground)" }}>
          <p className="mb-2">Your email is not verified yet. Check your inbox for a verification link.</p>
          {resendStatus === "sent" ? (
            <p className="font-medium" style={{ color: "var(--accent)" }}>Verification email sent!</p>
          ) : (
            <button
              onClick={handleResendVerification}
              disabled={resendStatus === "sending"}
              className="font-medium disabled:opacity-50"
              style={{ color: "var(--accent)" }}
            >
              {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleGoogleSignIn}
        className="mb-3 flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:opacity-80"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </button>

      <button
        onClick={handleTwitterSignIn}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:opacity-80"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
            fill="currentColor"
          />
        </svg>
        Continue with X
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="text-sm" style={{ color: "var(--muted)" }}>or</span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 outline-none transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 outline-none transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
