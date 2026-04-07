import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Custom heading styles with serif font
    h1: ({ children }) => (
      <h1 className="font-serif text-4xl leading-tight sm:text-5xl" style={{ color: "#dc3c3c" }}>
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="font-serif text-2xl sm:text-3xl" style={{ color: "var(--foreground)" }}>
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-serif text-xl sm:text-2xl" style={{ color: "var(--foreground)" }}>
        {children}
      </h3>
    ),
    // Style links with accent color
    a: ({ href, children }) => (
      <a
        href={href}
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        className="underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
      >
        {children}
      </a>
    ),
    // Blockquote styling
    blockquote: ({ children }) => (
      <blockquote
        className="border-l-4 pl-4 italic"
        style={{ borderColor: "var(--accent)", color: "var(--muted)" }}
      >
        {children}
      </blockquote>
    ),
    // Code blocks
    pre: ({ children }) => (
      <pre
        className="overflow-x-auto rounded-xl p-4 text-sm"
        style={{ background: "var(--surface-dim)", border: "1px solid var(--border)" }}
      >
        {children}
      </pre>
    ),
    // Table styling
    table: ({ children }) => (
      <div className="my-6 flex justify-center overflow-x-auto">
        <table className="text-sm" style={{ borderCollapse: "collapse" }}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead style={{ borderBottom: "2px solid var(--border)" }}>{children}</thead>
    ),
    th: ({ children }) => (
      <th
        className="px-4 py-2.5 text-left text-xs font-semibold"
        style={{ color: "var(--muted)" }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className="px-4 py-2 text-sm"
        style={{ color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}
      >
        {children}
      </td>
    ),
    tr: ({ children }) => (
      <tr>{children}</tr>
    ),
    code: ({ children, ...props }) => {
      // Inline code (not inside pre)
      const isInline = typeof children === "string";
      if (isInline) {
        return (
          <code
            className="rounded px-1.5 py-0.5 text-sm"
            style={{ background: "var(--surface-dim)", color: "var(--accent)" }}
            {...props}
          >
            {children}
          </code>
        );
      }
      return <code {...props}>{children}</code>;
    },
    ...components,
  };
}
