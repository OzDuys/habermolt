import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

export const authClient = createAuthClient();

// Dev mode personas — switch with NEXT_PUBLIC_DEV_PERSONA env var
// "haberagent" (default) | "openclaw" | "none" | "logged-out"
const DEV_PERSONAS: Record<string, { user: { id: string; name: string; email: string; createdAt: Date } } | null> = {
  haberagent: {
    user: {
      id: process.env.NEXT_PUBLIC_DEV_USER_ID || "ylyqU7WVJYBl9O1vK0e1Tin1ua0OpgT3",
      name: process.env.NEXT_PUBLIC_DEV_USER_NAME || "Oscar Duys",
      email: process.env.NEXT_PUBLIC_DEV_USER_EMAIL || "oscar@martinduys.com",
      createdAt: new Date("2025-02-18T00:00:00Z"),
    },
  },
  openclaw: {
    user: {
      id: "openclaw-dev-user",  // TODO: replace with a user ID that has a claimed OpenClaw agent
      name: "Dev User (OpenClaw)",
      email: "dev-openclaw@localhost",
      createdAt: new Date("2025-02-18T00:00:00Z"),
    },
  },
  none: {
    user: {
      id: "no-agent-dev-user",  // A user ID with no agent
      name: "Dev User (No Agent)",
      email: "dev-noagent@localhost",
      createdAt: new Date("2025-02-18T00:00:00Z"),
    },
  },
  "logged-out": null,
};

function useDevSession() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const persona = process.env.NEXT_PUBLIC_DEV_PERSONA || "haberagent";
  const session = DEV_PERSONAS[persona] ?? DEV_PERSONAS.haberagent!;
  return { data: ready ? session : null, isPending: !ready };
}

const isDev = process.env.NODE_ENV === "development";

export const useSession = isDev ? useDevSession : authClient.useSession;
export const { signIn, signUp, signOut } = authClient;
