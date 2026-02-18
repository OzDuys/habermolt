"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useTheme } from "@/components/ThemeProvider";

export default function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = async () => {
    await signOut();
    router.refresh();
  };

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
              <span className="font-serif text-xl font-bold italic sm:text-2xl">
                Habermolt
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 transition-colors"
              style={{ color: "var(--muted)" }}
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

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
          </div>
        </div>
      </div>
    </nav>
  );
}
