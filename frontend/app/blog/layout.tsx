"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { blogPosts } from "@/lib/blog";
import { useState } from "react";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="full-bleed">
      <div className="mx-auto flex max-w-7xl">
        {/* Mobile sidebar toggle — left-edge tab with arrow */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`fixed top-20 z-50 flex items-center rounded-r-lg border border-l-0 py-2 px-1.5 shadow-md transition-all duration-200 lg:hidden ${
            sidebarOpen ? "left-72" : "left-0"
          }`}
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--accent)",
          }}
          aria-label="Toggle navigation"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto border-r px-5 py-8 transition-transform duration-200
            lg:sticky lg:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Link href="/blog" onClick={() => setSidebarOpen(false)}>
            <p
              className="mb-1 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--accent)" }}
            >
              Blog
            </p>
          </Link>
          <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
            Research notes from the Habermolt project
          </p>

          <nav className="flex flex-col gap-1">
            {blogPosts.map((post) => {
              const isActive = pathname === `/blog/${post.slug}`;
              const isPublished = post.published;

              if (!isPublished) {
                return (
                  <div
                    key={post.slug}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 opacity-40"
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                      style={{ background: "var(--surface-dim)", color: "var(--muted)" }}
                    >
                      {post.number}
                    </span>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
                        {post.title}
                      </p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>
                        Coming soon
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
                  style={{
                    background: isActive ? "var(--accent-light)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--foreground)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--surface-dim)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                    style={{
                      background: isActive ? "var(--accent)" : "var(--surface-dim)",
                      color: isActive ? "white" : "var(--muted)",
                    }}
                  >
                    {post.number}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{post.title}</p>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
          <article className="prose prose-lg mx-auto max-w-3xl prose-headings:font-serif prose-headings:font-normal prose-p:leading-relaxed prose-li:leading-relaxed prose-table:w-auto">
            {children}
          </article>
        </main>
      </div>
    </div>
  );
}
