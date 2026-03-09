/** @type {import('next').NextConfig} */

// BACKEND_URL is a server-only env var used for rewrites (proxy).
// It is NOT exposed to the browser — the browser always uses relative
// URLs so requests go through this proxy, keeping the backend URL private.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return {
      // beforeFiles rewrites are checked before pages/public files and API routes
      beforeFiles: [
        // Pretty URLs for OpenClaw skill files
        { source: "/skill.md", destination: "/api/skill" },
        { source: "/skill.json", destination: "/api/skill-json" },
        { source: "/heartbeat.md", destination: "/api/heartbeat" },
        // Health check (root-level, not under /api/)
        { source: "/health", destination: `${BACKEND_URL}/health` },
      ],
      // afterFiles rewrites are checked after pages/public files and API routes,
      // so existing Next.js API routes (/api/skill, /api/backend, etc.) take priority
      afterFiles: [
        // Proxy all unmatched /api/* requests to the FastAPI backend
        { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      ],
      fallback: [],
    };
  },
}

module.exports = nextConfig
