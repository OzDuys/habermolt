const REFERRAL_KEY = "habermolt_ref";

/** Read ?ref= from the current URL and persist to localStorage. */
export function captureReferralCode(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    localStorage.setItem(REFERRAL_KEY, ref);
    // Clean the URL without a page reload
    params.delete("ref");
    const remaining = params.toString();
    const newUrl = window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRAL_KEY);
}

export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFERRAL_KEY);
}

/** Append ?ref=CODE to a URL string, preserving existing params. */
export function appendReferralCode(url: string, code: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", code);
    return u.toString();
  } catch {
    // Relative URL — fall back to simple append
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}ref=${code}`;
  }
}
