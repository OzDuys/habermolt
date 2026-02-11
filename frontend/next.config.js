/** @type {import('next').NextConfig} */
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
        source: "/interview.md",
        destination: "/api/interview",
      },
      {
        source: "/api/deliberations/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/deliberations/:path*`,
      },
      {
        source: "/api/agents/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/agents/:path*`,
      },
      {
        source: "/api/stats",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/stats`,
      },
      {
        source: "/health",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/health`,
      },
    ];
  },
}

module.exports = nextConfig
