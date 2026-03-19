"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/monitoring", label: "Dashboard", icon: "◈" },
  { href: "/monitoring/traces", label: "LLM Traces", icon: "⟐" },
  { href: "/monitoring/agent-requests", label: "Agent Requests", icon: "⇄" },
  { href: "/monitoring/deliberations", label: "Deliberations", icon: "◇" },
  { href: "/monitoring/config", label: "Config & Prompts", icon: "⚙" },
  { href: "/monitoring/skill-files", label: "Skill Files", icon: "◉" },
  { href: "/monitoring/moderation", label: "Moderation", icon: "⊘" },
  { href: "/monitoring/feedback", label: "Feedback", icon: "◫" },
  { href: "/monitoring/referrals", label: "Referrals", icon: "⊸" },
  { href: "/monitoring/emails", label: "Emails", icon: "✉" },
  { href: "/monitoring/database", label: "Database", icon: "▤" },
];

export default function MonitoringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("monitoring_secret");
    if (stored) {
      setSecret(stored);
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!secret.trim()) return;

    // Validate secret against backend
    try {
      const res = await fetch("/api/backend/monitoring/config", {
        headers: { "X-Monitoring-Secret": secret.trim() },
      });
      if (res.ok) {
        localStorage.setItem("monitoring_secret", secret.trim());
        setIsAuthenticated(true);
      } else {
        setError("Invalid secret");
      }
    } catch {
      setError("Could not connect to backend");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("monitoring_secret");
    setIsAuthenticated(false);
    setSecret("");
  };

  if (loading) {
    return (
      <div className="full-bleed flex items-center justify-center min-h-[80vh]">
        <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="full-bleed flex items-center justify-center min-h-[80vh]">
        <div
          className="w-full max-w-sm p-8 rounded-xl border"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold mb-1">Monitoring</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Enter secret to access the developer dashboard.
            </p>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Monitoring secret"
              className="w-full px-3 py-2 rounded-lg border text-sm mb-3"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mb-3">{error}</p>
            )}
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--foreground)", color: "var(--background)" }}
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isActive = (href: string) => {
    if (href === "/monitoring") return pathname === "/monitoring";
    return pathname.startsWith(href);
  };

  return (
    <div className="full-bleed flex min-h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside
        className="w-56 shrink-0 border-r flex flex-col"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="p-4 pb-2">
          <h2 className="text-sm font-bold tracking-wide uppercase" style={{ color: "var(--muted)" }}>
            Monitoring
          </h2>
        </div>
        <nav className="flex-1 px-2 py-1 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive(item.href) ? "font-medium" : "hover:opacity-80"
              }`}
              style={{
                background: isActive(item.href) ? "var(--foreground)" : "transparent",
                color: isActive(item.href) ? "var(--background)" : "var(--foreground)",
              }}
            >
              <span className="text-xs opacity-60">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={handleLogout}
            className="text-xs transition-opacity hover:opacity-60"
            style={{ color: "var(--muted)" }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
