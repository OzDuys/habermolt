import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function POST(request: NextRequest) {
  const session = await getDevOrRealSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 }
    );
  }

  const body = await request.json();

  const backendResponse = await fetch(`${BACKEND_URL}/api/agents/me/rate-consensus`, {
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

export async function GET(request: NextRequest) {
  const session = await getDevOrRealSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { detail: "Authentication required." },
      { status: 401 }
    );
  }

  const deliberationId = request.nextUrl.searchParams.get("deliberation_id");
  if (!deliberationId) {
    return NextResponse.json(
      { detail: "deliberation_id is required." },
      { status: 400 }
    );
  }

  const backendResponse = await fetch(
    `${BACKEND_URL}/api/agents/me/consensus-rating/${deliberationId}`,
    {
      headers: {
        "X-User-Id": session.user.id,
        "X-Internal-Secret": INTERNAL_API_SECRET,
      },
    }
  );

  const data = await backendResponse.json();
  return NextResponse.json(data, { status: backendResponse.status });
}
