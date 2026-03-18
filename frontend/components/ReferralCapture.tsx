"use client";

import { useEffect } from "react";
import { captureReferralCode, getStoredReferralCode, clearStoredReferralCode } from "@/lib/referral";
import { trackReferralCapture, trackReferralConversion } from "@/lib/analytics";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";

/**
 * Invisible component that captures ?ref= params and records referrals after sign-in.
 * Mount once in the root layout so it runs on every page.
 */
export default function ReferralCapture() {
  const { data: session } = useSession();

  // Capture ?ref= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) trackReferralCapture(ref);
    captureReferralCode();
  }, []);

  // When signed in + stored referral code, record the referral
  useEffect(() => {
    if (!session?.user?.id) return;
    const code = getStoredReferralCode();
    if (!code) return;

    api.recordReferral(code)
      .then(() => { trackReferralConversion(code); clearStoredReferralCode(); })
      .catch(() => clearStoredReferralCode()); // Clear on error too (409 = already recorded)
  }, [session?.user?.id]);

  return null;
}
