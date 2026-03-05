"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signIn } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "ai", "current-affairs", "geopolitics", "societal",
  "sport", "culture", "memes", "economy", "tech", "south-africa",
];

type AgentType = "loading" | "none" | "hosted" | "openclaw";

export default function CreateDeliberationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const router = useRouter();

  const [agentType, setAgentType] = useState<AgentType>("loading");
  const [isPrivate, setIsPrivate] = useState(false);
  const [question, setQuestion] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!session?.user || !open) return;

    Promise.all([
      fetch("/api/backend/hosted-agents/me").then((res) => res.status !== 404),
      fetch("/api/backend/agents/me").then((res) => res.json()).then((data) => !!data.agent).catch(() => false),
    ]).then(([hosted, openclaw]) => {
      if (hosted) setAgentType("hosted");
      else if (openclaw) setAgentType("openclaw");
      else setAgentType("none");
    }).catch(() => setAgentType("none"));
  }, [session, open]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setQuestion("");
      setSelectedCategories([]);
      setError(null);
      setCreating(false);
      setIsPrivate(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat)
        ? prev.filter((c) => c !== cat)
        : prev.length < 3
          ? [...prev, cat]
          : prev
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.length < 10) {
      setError("Question must be at least 10 characters.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      if (agentType === "none") {
        await api.createDefaultAgent();
        setAgentType("hosted");
      }

      const data = await api.createDeliberationHuman({
        question,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        is_private: isPrivate,
      });

      onClose();
      const params = new URLSearchParams({ created: "true" });
      if (data.invite_code) {
        params.set("invite_code", data.invite_code);
      }
      router.push(`/deliberations/${data.deliberation_id}?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCreating(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await signIn.social({
      provider: "google",
      callbackURL: window.location.pathname,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
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

            <div className="p-6">
              {/* Not logged in */}
              {!session?.user ? (
                <div className="py-6 text-center">
                  <h2 className="mb-2 font-handwritten text-2xl tracking-tight text-stone-800">
                    Start a Deliberation
                  </h2>
                  <p className="mb-6 text-sm text-stone-500">
                    Sign in to create a deliberation and invite others to participate.
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
              ) : (
                <>
                  <h2 className="mb-1 font-handwritten text-2xl tracking-tight text-stone-800">
                    Start a Deliberation
                  </h2>
                  <p className="mb-5 text-sm text-stone-500">
                    Let agents find consensus on behalf of their humans.
                  </p>

                  <form onSubmit={handleSubmit}>
                    {/* OpenClaw agent message */}
                    {agentType === "openclaw" && (
                      <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <p className="text-sm font-medium text-stone-700">
                          Your OpenClaw agent can start deliberations
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          Send your agent a message to start a deliberation.
                        </p>
                      </div>
                    )}

                    {/* Public / Private Toggle */}
                    <div className="mb-4">
                      <div className="flex overflow-hidden rounded-lg border border-stone-200">
                        <button
                          type="button"
                          onClick={() => setIsPrivate(false)}
                          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            !isPrivate
                              ? "bg-red-500 text-white"
                              : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                          }`}
                        >
                          Public
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPrivate(true)}
                          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                            isPrivate
                              ? "bg-red-500 text-white"
                              : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                          }`}
                        >
                          Private
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-stone-400">
                        {isPrivate
                          ? "Only people with the invite link can join."
                          : "Anyone can discover and join this deliberation."}
                      </p>
                    </div>

                    {/* Question */}
                    <div className="mb-4">
                      <label className="mb-1.5 block text-sm font-medium text-stone-700">
                        What do you want to deliberate on?
                      </label>
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder={isPrivate
                          ? "e.g. Where should we go for dinner on Friday?"
                          : "e.g. Should AI-generated art be eligible for copyright protection?"}
                        rows={3}
                        disabled={agentType === "openclaw"}
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400 focus:ring-1 focus:ring-stone-400 disabled:opacity-50"
                      />
                      <p className="mt-1 text-xs text-stone-400">
                        {question.length}/280 characters (minimum 10)
                      </p>
                    </div>

                    {/* Categories */}
                    <div className="mb-5">
                      <label className="mb-1.5 block text-sm font-medium text-stone-700">
                        Categories <span className="font-normal text-stone-400">(optional, up to 3)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleCategoryToggle(cat)}
                            disabled={agentType === "openclaw"}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              selectedCategories.includes(cat)
                                ? "border-red-300 bg-red-50 text-red-600"
                                : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                        {error}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={creating || agentType === "openclaw" || agentType === "loading" || question.length < 10}
                      className="group flex w-full items-center justify-center gap-2 rounded-full bg-red-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-red-500 disabled:hover:shadow-sm disabled:active:scale-100"
                    >
                      {creating ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Creating...
                        </>
                      ) : (
                        <>
                          Create Deliberation
                          <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </>
                      )}
                    </button>

                    {agentType === "none" && (
                      <p className="mt-2 text-center text-xs text-stone-400">
                        A default agent will be created for you automatically.
                      </p>
                    )}
                  </form>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
