"use client";

interface FigureProps {
  children: React.ReactNode;
  caption?: string;
  number?: number;
}

export default function Figure({ children, caption, number }: FigureProps) {
  return (
    <figure className="not-prose my-8">
      <div
        className="overflow-hidden rounded-xl border p-4 sm:p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {children}
      </div>
      {caption && (
        <figcaption
          className="mt-3 text-center text-sm"
          style={{ color: "var(--muted)" }}
        >
          {number && <span className="font-medium">Figure {number}. </span>}
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
