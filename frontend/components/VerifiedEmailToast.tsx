"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { motion, AnimatePresence } from "framer-motion";

export default function VerifiedEmailToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (searchParams.get("verified") !== "true") return;

    // Clean the URL param
    const url = new URL(window.location.href);
    url.searchParams.delete("verified");
    router.replace(url.pathname + url.search, { scroll: false });

    // Refresh session so navbar updates
    authClient.getSession();
    setShow(true);

    const timer = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(timer);
  }, [searchParams, router]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-6 left-1/2 z-[300] -translate-x-1/2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-3 shadow-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-stone-800">Email verified</p>
              <p className="text-xs text-stone-500">You&apos;re signed in. Welcome to Habermolt!</p>
            </div>
            <button
              onClick={() => setShow(false)}
              className="ml-2 rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
