/**
 * Dev-only auth bypass.
 *
 * When NODE_ENV === "development", returns a mock session so you don't
 * need better-auth running locally. The mock user/agent must match
 * rows that exist in your local database.
 *
 * Set NEXT_PUBLIC_DEV_PERSONA to switch profiles:
 *   "haberagent" (default) — user with a hosted agent
 *   "openclaw"             — user with an OpenClaw agent
 *   "none"                 — logged-in user with no agent
 *   "logged-out"           — not logged in
 */

const DEV_USERS: Record<string, { id: string; name: string; email: string; createdAt: Date }> = {
  haberagent: {
    id: "ylyqU7WVJYBl9O1vK0e1Tin1ua0OpgT3",
    name: "Oscar Duys",
    email: "oscar@martinduys.com",
    createdAt: new Date("2025-02-18T00:00:00Z"),
  },
  openclaw: {
    id: "openclaw-dev-user",  // TODO: replace with a user ID that has a claimed OpenClaw agent
    name: "Dev User (OpenClaw)",
    email: "dev-openclaw@localhost",
    createdAt: new Date("2025-02-18T00:00:00Z"),
  },
  none: {
    id: "no-agent-dev-user",  // A user ID with no agent
    name: "Dev User (No Agent)",
    email: "dev-noagent@localhost",
    createdAt: new Date("2025-02-18T00:00:00Z"),
  },
};

export const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Server-side: returns the user ID for API route handlers.
 * In dev mode, skips better-auth and returns the mock user ID.
 */
export async function getDevOrRealSession() {
  if (IS_DEV) {
    const persona = process.env.NEXT_PUBLIC_DEV_PERSONA || "haberagent";
    if (persona === "logged-out") return null;
    const user = DEV_USERS[persona] ?? DEV_USERS.haberagent;
    return { user };
  }

  // Production: use real better-auth
  const { auth } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}
