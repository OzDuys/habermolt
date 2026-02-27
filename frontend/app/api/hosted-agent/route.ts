import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

function authHeaders(userId: string) {
  return {
    "X-User-Id": userId,
    "X-Internal-Secret": INTERNAL_API_SECRET,
  };
}

export async function GET() {
  const session = await getDevOrRealSession();
  if (!session) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/me`, {
    headers: authHeaders(session.user.id),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const session = await getDevOrRealSession();
  if (!session) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/hosted-agents`, {
    method: "POST",
    headers: { ...authHeaders(session.user.id), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const session = await getDevOrRealSession();
  if (!session) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/me`, {
    method: "PATCH",
    headers: { ...authHeaders(session.user.id), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE() {
  const session = await getDevOrRealSession();
  if (!session) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/me`, {
    method: "DELETE",
    headers: authHeaders(session.user.id),
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
