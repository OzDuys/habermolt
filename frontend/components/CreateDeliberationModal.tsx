"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import SignInModal from "@/components/SignInModal";

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

  // Not logged in — show sign-in modal directly (no create modal chrome)
  if (!session?.user) {
    return (
      <SignInModal
        open={open}
        onClose={onClose}
        intent="create-deliberation"
      />
    );
  }

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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
