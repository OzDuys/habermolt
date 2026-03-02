import { NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function POST() {
  const session = await getDevOrRealSession();
  if (!session?.user?.id) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/hosted-agents/create-default`, {
    method: "POST",
    headers: {
      "X-User-Id": session.user.id,
      "X-Internal-Secret": INTERNAL_API_SECRET,
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
