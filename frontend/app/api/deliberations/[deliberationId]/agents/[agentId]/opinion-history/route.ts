import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ deliberationId: string; agentId: string }> }
) {
  const { deliberationId, agentId } = await params;
  const res = await fetch(
    `${BACKEND_URL}/api/deliberations/${deliberationId}/agents/${agentId}/opinion-history`
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
