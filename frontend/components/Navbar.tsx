"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

const menuItems = [
  {
    href: "/consensus",
    label: "How it works",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
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
    await signOut();
    router.refresh();
  };

  // Close menu when clicking outside
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
    <nav className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex flex-shrink-0 items-center">
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
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isPending ? (
              <div className="h-4 w-20 animate-pulse rounded" style={{ background: "var(--surface-dim)" }} />
            ) : session ? (
              <>
                <Link
                  href="/profile"
                  className="text-sm font-medium transition-colors hover:opacity-80"
                  style={{ color: "var(--muted)" }}
                >
                  {session.user.name || session.user.email}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{ background: "var(--surface-dim)", color: "var(--muted)" }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 sm:px-4"
                style={{ background: "var(--accent)" }}
              >
                Sign In
              </Link>
            )}

            {/* Hamburger menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--muted)", background: menuOpen ? "var(--surface-dim)" : "transparent" }}
                aria-label="Menu"
              >
                {/* Animated hamburger → X */}
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
                <div className="py-1.5">
                  {menuItems.map((item) => (
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
