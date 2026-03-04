"use client";

export default function TokenUsageBar({
  used,
  limit,
  tier,
}: {
  used: number;
  limit: number | null;
  tier: string;
}) {
  if (tier === "byok" || limit === null) {
    return (
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Unlimited (BYOK) &mdash; {used.toLocaleString()} tokens used this week
      </div>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const isNearLimit = pct >= 80;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span style={{ color: "var(--muted)" }}>
          {used.toLocaleString()} / {limit.toLocaleString()} tokens this week
        </span>
        <span
          className="font-medium"
          style={{ color: isNearLimit ? "var(--danger, #ef4444)" : "var(--muted)" }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-dim, var(--border))" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: isNearLimit ? "var(--danger, #ef4444)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
