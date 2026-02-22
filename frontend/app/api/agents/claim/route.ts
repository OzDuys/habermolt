import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function POST(request: NextRequest) {
  // Validate better-auth session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json(
      { detail: "Authentication required. Please log in first." },
      { status: 401 }
    );
  }

  // Forward the claim request to the backend with the authenticated user ID
  const body = await request.json();

  const backendResponse = await fetch(`${BACKEND_URL}/api/agents/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": session.user.id,
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
    body: JSON.stringify(body),
  });

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: backendResponse.status });
}
