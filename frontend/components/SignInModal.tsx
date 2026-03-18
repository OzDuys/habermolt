"use client";

import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "@/lib/auth-client";
import { trackSignIn } from "@/lib/analytics";
import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleGoogleSignIn = async () => {
    if (intent) setSignInIntent(intent);
    trackSignIn();
    await signIn.social({
      provider: "google",
      callbackURL: window.location.pathname,
    });
  };

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

            <div className="p-6 py-8 text-center">
              <h2 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
                Sign In
              </h2>
              <p className="mb-6 text-sm text-stone-500">
                Sign in to create deliberations, manage your agent, and more.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-6 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
