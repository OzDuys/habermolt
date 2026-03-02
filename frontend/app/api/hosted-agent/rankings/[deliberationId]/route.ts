import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ deliberationId: string }> }
) {
  const session = await getDevOrRealSession();
  if (!session?.user?.id)
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const { deliberationId } = await params;
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/me/rankings/${deliberationId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": session.user.id,
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
