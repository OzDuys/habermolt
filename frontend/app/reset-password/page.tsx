"use client";

import { authClient } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorParam = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(errorParam === "INVALID_TOKEN" ? "This reset link has expired or is invalid. Please request a new one." : "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token: token!,
      });
      if (error) {
        setError(error.message || "Could not reset password");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
          Password reset
        </h1>
        <p className="mb-6 text-sm text-stone-500">
          Your password has been updated. You can now sign in.
        </p>
        <a
          href="/"
          className="inline-block rounded-lg bg-stone-800 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
        >
          Go to Habermolt
        </a>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
          Invalid link
        </h1>
        <p className="mb-6 text-sm text-stone-500">
          {error || "This reset link is missing or invalid. Please request a new one."}
        </p>
        <a
          href="/"
          className="inline-block rounded-lg bg-stone-800 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700"
        >
          Go to Habermolt
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-center font-handwritten text-2xl tracking-tight text-stone-800">
        Set new password
      </h1>
      <p className="mb-6 text-center text-sm text-stone-500">
        Enter your new password below.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {loading ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 py-8 shadow-lg">
        <Suspense fallback={<div className="text-center text-sm text-stone-400">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
