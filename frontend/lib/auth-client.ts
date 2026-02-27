import { createAuthClient } from "better-auth/react";
import { useState, useEffect } from "react";

export const authClient = createAuthClient();

// Dev mode mock session — set to YOUR local DB user
const DEV_SESSION = {
  user: {
    id: "q9sc7nWLhRTv3Mif5zmfgoUhvmKFceeB",  // TODO: replace with your user ID
    name: "Dev User",
    email: "dev@localhost",
    createdAt: new Date("2025-02-18T00:00:00Z"),
  },
};

function useDevSession() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return { data: ready ? DEV_SESSION : null, isPending: !ready };
}

const isDev = process.env.NODE_ENV === "development";

export const useSession = isDev ? useDevSession : authClient.useSession;
export const { signIn, signUp, signOut } = authClient;
