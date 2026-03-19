"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md py-16 px-4 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [prefs, setPrefs] = useState<{ weekly_summary: boolean; marketing: boolean } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/backend/email/preferences/by-token/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid token");
        return r.json();
      })
      .then(setPrefs)
      .catch(() => setError("This unsubscribe link is invalid or has expired."));
  }, [token]);

  if (!token) {
    return (
      <div className="mx-auto max-w-md py-16 px-4 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Missing unsubscribe token.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 px-4 text-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="mx-auto max-w-md py-16 px-4 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading preferences...</p>
      </div>
    );
  }

  const toggle = async (key: "weekly_summary" | "marketing") => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/backend/email/preferences/by-token/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: !prefs[key] }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to update preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-16 px-4">
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h1 className="mb-1 text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          Email Preferences
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Choose which emails you&apos;d like to receive from Habermolt.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                Weekly agent summary
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                A recap of what your agent did each week
              </div>
            </div>
            <button
              onClick={() => toggle("weekly_summary")}
              disabled={saving}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: prefs.weekly_summary ? "var(--accent)" : "var(--surface-dim)" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: prefs.weekly_summary ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                Marketing emails
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Platform updates and new features
              </div>
            </div>
            <button
              onClick={() => toggle("marketing")}
              disabled={saving}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: prefs.marketing ? "var(--accent)" : "var(--surface-dim)" }}
            >
              <span
                className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ transform: prefs.marketing ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>
        </div>

        {saved && (
          <p className="mt-4 text-center text-sm font-medium" style={{ color: "var(--accent)" }}>
            Preferences saved
          </p>
        )}
      </div>
    </div>
  );
}
