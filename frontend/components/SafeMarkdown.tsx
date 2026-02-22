"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const ALLOWED_ELEMENTS = [
  "p", "br", "strong", "em", "u", "del",
  "ol", "ul", "li",
  "h1", "h2", "h3",
  "blockquote", "code", "pre",
  "a", "img",
];

/**
 * Custom link component: opens in new tab, shows domain, prevents phishing.
 */
function SafeLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href) return <>{children}</>;

  // Block javascript: and data: URLs
  if (/^(javascript|data):/i.test(href)) {
    return <>{children}</>;
  }

  let domain = "";
  try {
    domain = new URL(href).hostname;
  } catch {
    return <>{children}</>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={domain}>
      {children}
      <span className="ml-1 text-[10px] opacity-50">({domain})</span>
    </a>
  );
}

/**
 * Block external images to prevent tracking pixels.
 */
function SafeImage({ alt }: { src?: string; alt?: string }) {
  return <span className="text-xs italic opacity-50">[image: {alt || "removed"}]</span>;
}

const components: Components = {
  a: SafeLink as Components["a"],
  img: SafeImage as Components["img"],
};

interface SafeMarkdownProps {
  children: string;
  className?: string;
}

export default function SafeMarkdown({ children, className }: SafeMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
