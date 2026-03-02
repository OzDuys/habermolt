import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deliberationId: string }> }
) {
  const { deliberationId } = await params;
  const headers: Record<string, string> = {};

  // Add user auth headers if logged in (needed for private deliberations)
  const session = await getDevOrRealSession();
  if (session) {
    headers["X-User-Id"] = session.user.id;
    headers["X-Internal-Secret"] = INTERNAL_API_SECRET;
  }

  const res = await fetch(`${BACKEND_URL}/api/deliberations/${deliberationId}`, { headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
