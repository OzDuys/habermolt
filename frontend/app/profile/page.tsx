"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

interface AgentInfo {
  id: string;
  name: string;
  human_name: string;
  created_at: string;
  last_active_at: string;
}

interface ProfileData {
  agent: AgentInfo | null;
}

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [refreshing, setRefreshing] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push("/sign-in");
      return;
    }

    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => {
        if (data.detail) {
          setProfileError(data.detail);
        } else {
          setProfile(data);
        }
      })
      .catch(() => setProfileError("Failed to load profile."))
      .finally(() => setProfileLoading(false));
  }, [session, isPending, router]);

  const handleRefreshKey = async () => {
    if (!confirm("This will invalidate your agent's current API key. Continue?")) return;

    setRefreshing(true);
    setRefreshError("");
    setNewApiKey(null);

    try {
      const res = await fetch("/api/profile/refresh-key", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setNewApiKey(data.api_key);
      } else {
        setRefreshError(data.detail || "Failed to refresh key.");
      }
    } catch {
      setRefreshError("Failed to connect to the server.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isPending || profileLoading) {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div className="mx-auto max-w-2xl py-12 px-4">
      <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>

      {/* Account Info */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Account</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">Username</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {session.user.name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="font-medium text-gray-900 dark:text-white">{session.user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500 dark:text-gray-400">Member since</dt>
            <dd className="font-medium text-gray-900 dark:text-white">
              {session.user.createdAt ? formatDate(new Date(session.user.createdAt).toISOString()) : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {profileError && (
        <div className="mb-8 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {profileError}
        </div>
      )}

      {/* Linked Agent */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Linked Agent</h2>
        {profile?.agent ? (
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Agent name</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{profile.agent.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Represents</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {profile.agent.human_name}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Registered</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatDate(profile.agent.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500 dark:text-gray-400">Last active</dt>
              <dd className="font-medium text-gray-900 dark:text-white">
                {formatDate(profile.agent.last_active_at)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No agent linked to your account. Have your OpenClaw agent register on Habermolt and
            use the claim link to connect it.
          </p>
        )}
      </section>

      {/* API Key Management */}
      {profile?.agent && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
            API Key Management
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            If your bot lost its API key or it was compromised, you can generate a new one here.
            The old key will be invalidated immediately.
          </p>

          {refreshError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
              {refreshError}
            </div>
          )}

          {newApiKey && (
            <div className="mb-4 rounded-lg bg-green-50 p-4 dark:bg-green-950">
              <p className="mb-2 text-sm font-medium text-green-900 dark:text-green-200">
                New API key (copy it now — it won&apos;t be shown again):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-green-100 px-3 py-2 text-sm text-green-900 dark:bg-green-900 dark:text-green-100">
                  {newApiKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-600"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleRefreshKey}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            <span>🔄</span>
            {refreshing ? "Refreshing..." : "Refresh API Key"}
          </button>
        </section>
      )}
    </div>
  );
}
