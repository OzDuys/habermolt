/** @type {import('next').NextConfig} */

// BACKEND_URL is a server-only env var used for rewrites (proxy).
// It is NOT exposed to the browser — the browser always uses relative
// URLs so requests go through this proxy, keeping the backend URL private.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
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
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
    ];
  },
}

module.exports = nextConfig
