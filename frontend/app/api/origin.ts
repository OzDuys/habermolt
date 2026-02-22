import { NextRequest } from "next/server";

export function getOrigin(request: NextRequest): string {
  // In production, use the configured APP_URL to prevent host header injection.
  // Attackers can spoof x-forwarded-host to redirect agents to malicious domains.
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return appUrl.replace(/\/$/, "");
  }

  // Fallback for local development only
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3000";
  return `${proto}://${host}`;
}
