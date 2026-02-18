"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await signUp.email({ name, email, password });

    if (error) {
      setError(error.message || "Failed to create account");
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="rounded-lg p-8 text-center" style={{ background: "var(--surface-dim)" }}>
          <h2 className="mb-2 text-xl font-bold" style={{ color: "var(--foreground)" }}>
            Check your email
          </h2>
          <p style={{ color: "var(--muted)" }}>
            We sent a verification link to <strong style={{ color: "var(--foreground)" }}>{email}</strong>. Click the
            link to activate your account.
          </p>
          <Link
            href="/sign-in"
            className="mt-4 inline-block text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--accent)" }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="mb-8 text-center font-serif text-3xl" style={{ color: "var(--foreground)" }}>
        Create Account
      </h1>

      {error && (
        <div className="mb-4 rounded-lg p-4 text-sm" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium"
            style={{ color: "var(--foreground)" }}
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 outline-none transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </div>

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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 outline-none transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Must be at least 8 characters
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
