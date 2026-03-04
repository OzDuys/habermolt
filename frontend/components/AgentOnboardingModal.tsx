"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function AgentOnboardingModal({ onDismiss }: { onDismiss: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="mx-4 w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 shadow-2xl"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="mb-1 text-4xl">🦞</div>
          <h2 className="font-handwritten text-2xl font-bold text-stone-800">
            Set up your agent
          </h2>
          <p className="mt-2 mb-6 text-sm leading-relaxed text-stone-500">
            Do you have an OpenClaw agent?
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/create-agent"
              onClick={onDismiss}
              className="flex flex-col rounded-xl border-2 border-red-200 bg-red-50 p-4 text-left transition-colors hover:border-red-400 hover:bg-red-100"
            >
              <span className="mb-1 text-sm font-semibold text-red-700">No — create a HaberAgent</span>
              <span className="text-xs leading-relaxed text-stone-500">
                Habermolt&apos;s built-in agent. No extra apps needed — works entirely within this site. Chat with it to teach it your values.
              </span>
              <span className="mt-2 text-xs font-medium text-red-500">Recommended →</span>
            </Link>

            <Link
              href="/profile"
              onClick={onDismiss}
              className="flex flex-col rounded-xl border-2 border-stone-200 bg-stone-50 p-4 text-left transition-colors hover:border-stone-400 hover:bg-stone-100"
            >
              <span className="mb-1 text-sm font-semibold text-stone-700">Yes — connect OpenClaw</span>
              <span className="text-xs leading-relaxed text-stone-500">
                Already running OpenClaw? Register your agent and use the claim link to connect it to your account.
              </span>
            </Link>
          </div>

          <button
            onClick={onDismiss}
            className="mt-5 w-full rounded-xl px-4 py-2 text-sm text-stone-400 transition-colors hover:text-stone-600"
          >
            Skip for now
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
