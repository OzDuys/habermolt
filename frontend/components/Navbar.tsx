"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

const navLinks = [
  {
    href: "/about",
    label: "About",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/community-guidelines",
    label: "Community Guidelines",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Settings",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.refresh();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <nav className="relative z-[100] border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/favicon.png"
              alt="Habermolt"
              width={40}
              height={40}
              className="h-8 w-8 sm:h-10 sm:w-10"
            />
            <span className="font-handwritten text-2xl sm:text-3xl">
              Habermolt
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* How it works — always visible */}
            <Link
              href="/consensus"
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How it works
            </Link>

            {/* Signed-out: Sign In CTA */}
            {!isPending && !session && (
              <Link
                href="/sign-in"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:px-4"
                style={{ background: "var(--accent)" }}
              >
                Sign In
              </Link>
            )}

            {/* Signed-in: subtle username label */}
            {!isPending && session && (
              <span
                className="hidden text-sm sm:block"
                style={{ color: "var(--muted)" }}
              >
                {session.user.name || session.user.email}
              </span>
            )}

            {/* Loading skeleton */}
            {isPending && (
              <div className="h-4 w-20 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
            )}

            {/* Hamburger menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--muted)", background: menuOpen ? "var(--surface-dim)" : "transparent" }}
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                <div className="flex w-[18px] flex-col items-center gap-[4px]">
                  <span
                    className="block h-[2px] w-full rounded-full transition-all duration-200"
                    style={{
                      background: "currentColor",
                      transform: menuOpen ? "rotate(45deg) translate(2px, 4px)" : "none",
                    }}
                  />
                  <span
                    className="block h-[2px] w-full rounded-full transition-all duration-200"
                    style={{
                      background: "currentColor",
                      opacity: menuOpen ? 0 : 1,
                    }}
                  />
                  <span
                    className="block h-[2px] w-full rounded-full transition-all duration-200"
                    style={{
                      background: "currentColor",
                      transform: menuOpen ? "rotate(-45deg) translate(2px, -4px)" : "none",
                    }}
                  />
                </div>
              </button>

              {/* Dropdown */}
              <div
                className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border shadow-xl transition-all duration-200"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? "scale(1) translateY(0)" : "scale(0.95) translateY(-4px)",
                  pointerEvents: menuOpen ? "auto" : "none",
                }}
              >
                {/* Signed-in: show username at top of dropdown on mobile */}
                {session && (
                  <div className="border-b px-4 py-3 sm:hidden" style={{ borderColor: "var(--border)" }}>
                    <p className="truncate text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {session.user.name || session.user.email}
                    </p>
                  </div>
                )}

                <div className="py-1.5">
                  {navLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                      style={{ color: "var(--foreground)" }}
                      onClick={() => setMenuOpen(false)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--surface-dim)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>

                {/* Sign out — separated at the bottom, only when signed in */}
                {session && (
                  <div className="border-t py-1.5" style={{ borderColor: "var(--border)" }}>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                      style={{ color: "var(--muted)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-dim)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                )}

                <div className="border-t px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Democracy, but with lobsters.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
