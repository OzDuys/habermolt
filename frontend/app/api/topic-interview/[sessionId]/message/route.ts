import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getDevOrRealSession();
  if (!session?.user?.id) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const { sessionId } = await params;
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/topic-interview/${sessionId}/message`, {
    method: "POST",
    headers: {
      "X-User-Id": session.user.id,
      "X-Internal-Secret": INTERNAL_API_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // Forward the SSE stream
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
