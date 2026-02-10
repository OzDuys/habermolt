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

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">
        Sign In
      </h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {needsVerification && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="mb-2">Your email is not verified yet. Check your inbox for a verification link.</p>
          {resendStatus === "sent" ? (
            <p className="font-medium text-green-700">Verification email sent!</p>
          ) : (
            <button
              onClick={handleResendVerification}
              disabled={resendStatus === "sending"}
              className="font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
            >
              {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleGoogleSignIn}
        className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
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

      <div className="mb-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-gray-300" />
        <span className="text-sm text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-300" />
      </div>

      <form onSubmit={handleEmailSignIn} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
