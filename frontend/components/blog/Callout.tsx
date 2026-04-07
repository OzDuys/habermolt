"use client";

interface CalloutProps {
  label?: string;
  children: React.ReactNode;
  variant?: "default" | "insight" | "technical";
}

const variants = {
  default: {
    border: "var(--accent)",
    bg: "rgba(217, 119, 6, 0.05)",
    labelColor: "var(--accent)",
  },
  insight: {
    border: "#dc3c3c",
    bg: "rgba(220, 60, 60, 0.04)",
    labelColor: "#dc3c3c",
  },
  technical: {
    border: "var(--muted)",
    bg: "var(--surface-dim)",
    labelColor: "var(--muted)",
  },
};

export default function Callout({ label, children, variant = "default" }: CalloutProps) {
  const v = variants[variant];
  return (
    <div
      className="not-prose my-6 rounded-xl border-l-4 py-4 pl-5 pr-4"
      style={{ borderColor: v.border, background: v.bg }}
    >
      {label && (
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: v.labelColor }}
        >
          {label}
        </p>
      )}
      <div className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {children}
      </div>
    </div>
  );
}
