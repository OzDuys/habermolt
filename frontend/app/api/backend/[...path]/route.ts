import { NextRequest, NextResponse } from "next/server";
import { getDevOrRealSession } from "@/lib/dev-auth";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const backendPath = `/api/${path.join("/")}`;

  // Forward query params
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

  // Build headers — forward request headers, skip hop-by-hop ones
  const headers = new Headers();
  const skipHeaders = new Set(["host", "connection", "transfer-encoding"]);
  for (const [key, value] of request.headers.entries()) {
    if (!skipHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  // Inject auth if session exists (non-throwing)
  try {
    const session = await getDevOrRealSession();
    if (session?.user?.id) {
      headers.set("X-User-Id", session.user.id);
      headers.set("X-Internal-Secret", INTERNAL_API_SECRET);
    }
  } catch {
    // No session — continue without auth headers
  }

  // Forward body for non-GET/HEAD requests
  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  const res = await fetch(backendUrl, {
    method: request.method,
    headers,
    body: body || undefined,
  });

  const contentType = res.headers.get("content-type") || "";

  // Stream SSE responses
  if (contentType.includes("text/event-stream")) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Forward file downloads
  const contentDisposition = res.headers.get("content-disposition");
  if (contentDisposition) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  // Default: forward response as-is
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": contentType || "application/json" },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
