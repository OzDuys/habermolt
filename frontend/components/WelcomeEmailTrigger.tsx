"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";

/**
 * Invisible component that fires the welcome email on first login.
 * Mount once in the root layout. The backend endpoint is idempotent
 * (sends only once per user), so repeated calls are safe.
 */
export default function WelcomeEmailTrigger() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id) return;

    // Check localStorage to avoid hitting the endpoint on every page load
    const key = `welcome_email_sent_${session.user.id}`;
    if (localStorage.getItem(key)) return;

    api.sendWelcomeEmail()
      .then((res) => {
        // Mark sent in localStorage regardless — endpoint is idempotent,
        // but we avoid unnecessary network calls on subsequent page loads
        localStorage.setItem(key, "1");
      })
      .catch(() => {
        // Silently fail — non-critical
      });
  }, [session?.user?.id]);

  return null;
}
