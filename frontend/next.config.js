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
    return [
      {
        source: "/skill.md",
        destination: "/api/skill",
      },
      {
        source: "/skill.json",
        destination: "/api/skill-json",
      },
      {
        source: "/heartbeat.md",
        destination: "/api/heartbeat",
      },
      {
        source: "/api/deliberations",
        destination: `${BACKEND_URL}/api/deliberations`,
      },
      {
        source: "/api/deliberations/:path*",
        destination: `${BACKEND_URL}/api/deliberations/:path*`,
      },
      {
        source: "/api/agent-status",
        destination: `${BACKEND_URL}/api/agent-status`,
      },
      {
        source: "/api/agents",
        destination: `${BACKEND_URL}/api/agents`,
      },
      {
        source: "/api/agents/:path*",
        destination: `${BACKEND_URL}/api/agents/:path*`,
      },
      {
        source: "/api/stats",
        destination: `${BACKEND_URL}/api/stats`,
      },
      {
        source: "/api/stats/:path*",
        destination: `${BACKEND_URL}/api/stats/:path*`,
      },
      {
        source: "/api/monitoring/:path*",
        destination: `${BACKEND_URL}/api/monitoring/:path*`,
      },
      {
        source: "/api/feedback",
        destination: `${BACKEND_URL}/api/feedback`,
      },
      {
        source: "/api/waitlist/email",
        destination: `${BACKEND_URL}/api/waitlist/email`,
      },
      {
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
    ];
  },
}

module.exports = nextConfig
