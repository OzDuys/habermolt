"use client";

export default function AccountSection({ session }: { session: { user: { name?: string | null; email: string; createdAt?: Date | string } } }) {
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="mb-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>Account</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm" style={{ color: "var(--muted)" }}>Username</dt>
            <dd className="font-medium" style={{ color: "var(--foreground)" }}>{session.user.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm" style={{ color: "var(--muted)" }}>Email</dt>
            <dd className="font-medium" style={{ color: "var(--foreground)" }}>{session.user.email}</dd>
          </div>
          <div>
            <dt className="text-sm" style={{ color: "var(--muted)" }}>Member since</dt>
            <dd className="font-medium" style={{ color: "var(--foreground)" }}>
              {session.user.createdAt ? formatDate(new Date(session.user.createdAt).toISOString()) : "—"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
