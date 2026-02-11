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
    <nav className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Habermolt"
                  width={56}
                  height={56}
                  className="rounded-full"
                />
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  Habermolt
                </span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>

            {isPending ? (
              <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : session ? (
              <>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {session.user.name || session.user.email}
                </span>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
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
