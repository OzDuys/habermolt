import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getDevOrRealSession();
  if (!session?.user?.id)
    return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const { sessionId } = await params;
  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/me/chat/${sessionId}/download`, {
    headers: {
      "X-User-Id": session.user.id,
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
  });
  const content = await res.text();
  return new NextResponse(content, {
    status: res.status,
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": res.headers.get("Content-Disposition") || 'attachment; filename="transcript.md"',
    },
  });
}
