/**
 * Dev-only auth bypass.
 *
 * When NODE_ENV === "development", returns a mock session so you don't
 * need better-auth running locally. The mock user/agent must match
 * rows that exist in your local database.
 */

const DEV_USER = {
  id: "q9sc7nWLhRTv3Mif5zmfgoUhvmKFceeB",
  name: "Pieter Oscar Duys",
  email: "oscarduys@gmail.com",
  createdAt: new Date("2025-02-18T00:00:00Z"),
};

export const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Server-side: returns the user ID for API route handlers.
 * In dev mode, skips better-auth and returns the mock user ID.
 */
export async function getDevOrRealSession() {
  if (IS_DEV) {
    return { user: DEV_USER };
  }

  // Production: use real better-auth
  const { auth } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}
