"use client";

export default function AccountSection({ session, onSignOut }: { session: { user: { name?: string | null; email: string; createdAt?: Date | string } }; onSignOut: () => void }) {
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h3 className="mb-4 text-sm font-semibold" style={{ color: "var(--foreground)" }}>Account</h3>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between py-2.5">
          <span className="text-sm" style={{ color: "var(--muted)" }}>Username</span>
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{session.user.name || "—"}</span>
        </div>
        <div className="flex items-center justify-between py-2.5" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Email</span>
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{session.user.email}</span>
        </div>
        <div className="flex items-center justify-between py-2.5" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--muted)" }}>Member since</span>
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {session.user.createdAt ? formatDate(new Date(session.user.createdAt).toISOString()) : "—"}
          </span>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={onSignOut}
          className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
