"use client";

import { motion, AnimatePresence } from "framer-motion";
import { signIn, signUp, authClient } from "@/lib/auth-client";
import { trackSignIn } from "@/lib/analytics";
import { useEffect, useState, useRef } from "react";

/**
 * After sign-in, the user is redirected back. Any component can check
 * sessionStorage for "signInIntent" to restore the user's previous action.
 */
export function setSignInIntent(intent: string) {
  sessionStorage.setItem("signInIntent", intent);
}

export function consumeSignInIntent(): string | null {
  const intent = sessionStorage.getItem("signInIntent");
  if (intent) sessionStorage.removeItem("signInIntent");
  return intent;
}

type Mode = "signin" | "signup" | "forgot" | "check-email" | "verify-email";

export default function SignInModal({
  open,
  onClose,
  intent,
}: {
  open: boolean;
  onClose: () => void;
  /** Optional intent to restore after OAuth redirect (e.g. "create-deliberation") */
  intent?: string;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setMode("signin");
      setEmail("");
      setPassword("");
      setName("");
      setError("");
      setLoading(false);
      setResendCooldown(0);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const startResendCooldown = () => {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      // Re-attempting sign-in triggers automatic resend (sendOnSignIn: true)
      await signIn.email({ email, password, callbackURL: window.location.pathname });
    } catch {
      // ignore - expected to fail since email isn't verified yet
    } finally {
      startResendCooldown();
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (intent) setSignInIntent(intent);
    trackSignIn();
    await signIn.social({
      provider: "google",
      callbackURL: window.location.pathname,
    });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (intent) setSignInIntent(intent);
      trackSignIn();
      const { error } = await signIn.email({
        email,
        password,
        callbackURL: window.location.pathname,
      });
      if (error) {
        if (error.message?.toLowerCase().includes("email not verified")) {
          setMode("verify-email");
          startResendCooldown();
        } else {
          setError(error.message || "Invalid email or password");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { error } = await signUp.email({
        name,
        email,
        password,
        callbackURL: window.location.pathname,
      });
      if (error) {
        setError(error.message || "Could not create account");
      } else {
        setMode("check-email");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setError(error.message || "Could not send reset email");
      } else {
        setMode("check-email");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const emailIcon = (
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100">
      <svg className="h-6 w-6 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-6 py-8">
              {mode === "verify-email" ? (
                <div className="text-center">
                  {emailIcon}
                  <h2 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
                    Verify your email
                  </h2>
                  <p className="mb-4 text-sm text-stone-500">
                    We sent a verification link to <span className="font-medium text-stone-700">{email}</span>. Please check your inbox and click the link to continue.
                  </p>
                  <p className="mb-4 text-xs text-stone-400">
                    Check your spam folder if you don&apos;t see it.
                  </p>
                  <button
                    onClick={handleResendVerification}
                    disabled={resendCooldown > 0 || loading}
                    className="mb-3 w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
                  >
                    {loading
                      ? "Sending..."
                      : resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : "Resend verification email"}
                  </button>
                  {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
                  <button
                    onClick={() => { setMode("signin"); setError(""); }}
                    className="text-sm text-stone-500 underline hover:text-stone-700"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : mode === "check-email" ? (
                <div className="text-center">
                  {emailIcon}
                  <h2 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
                    Check your email
                  </h2>
                  <p className="mb-6 text-sm text-stone-500">
                    We sent a link to <span className="font-medium text-stone-700">{email}</span>. Click it to continue.
                  </p>
                  <button
                    onClick={() => { setMode("signin"); setError(""); }}
                    className="text-sm text-stone-500 underline hover:text-stone-700"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : mode === "forgot" ? (
                <div>
                  <h2 className="mb-2 text-center font-handwritten text-2xl tracking-tight text-stone-800">
                    Reset password
                  </h2>
                  <p className="mb-6 text-center text-sm text-stone-500">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300"
                    />
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
                    >
                      {loading ? "Sending..." : "Send reset link"}
                    </button>
                  </form>
                  <button
                    onClick={() => { setMode("signin"); setError(""); }}
                    className="mt-4 block w-full text-center text-sm text-stone-500 hover:text-stone-700"
                  >
                    Back to sign in
                  </button>
                </div>
              ) : (
                <div>
                  <h2 className="mb-2 text-center font-handwritten text-2xl tracking-tight text-stone-800">
                    {mode === "signin" ? "Sign In" : "Create Account"}
                  </h2>
                  <p className="mb-6 text-center text-sm text-stone-500">
                    {mode === "signin"
                      ? "Sign in to create deliberations, manage your agent, and more."
                      : "Create an account to get started."}
                  </p>

                  {/* Google sign-in */}
                  <button
                    onClick={handleGoogleSignIn}
                    className="mb-4 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-6 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </button>

                  {/* Divider */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-stone-200" />
                    <span className="text-xs text-stone-400">or</span>
                    <div className="h-px flex-1 bg-stone-200" />
                  </div>

                  {/* Email form */}
                  <form onSubmit={mode === "signin" ? handleEmailSignIn : handleEmailSignUp} className="space-y-3">
                    {mode === "signup" && (
                      <input
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300"
                      />
                    )}
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-300"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                      {loading
                        ? "Loading..."
                        : mode === "signin"
                          ? "Sign in"
                          : "Create account"}
                    </button>
                  </form>

                  {/* Terms notice */}
                  {mode === "signup" && (
                    <p className="mt-3 text-center text-xs text-stone-400">
                      By signing up, you agree to our{" "}
                      <a href="/terms" target="_blank" className="underline hover:text-stone-600">Terms of Service</a>
                      {" "}and{" "}
                      <a href="/privacy" target="_blank" className="underline hover:text-stone-600">Privacy Policy</a>.
                    </p>
                  )}

                  {/* Footer links */}
                  <div className="mt-4 space-y-2 text-center text-sm">
                    {mode === "signin" && (
                      <button
                        onClick={() => { setMode("forgot"); setError(""); }}
                        className="block w-full text-stone-400 hover:text-stone-600"
                      >
                        Forgot password?
                      </button>
                    )}
                    <button
                      onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
                      className="block w-full text-stone-500 hover:text-stone-700"
                    >
                      {mode === "signin"
                        ? "Don't have an account? Sign up"
                        : "Already have an account? Sign in"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
