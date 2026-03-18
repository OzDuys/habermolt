import { track } from "@vercel/analytics";

/** Track when a user copies a share link */
export function trackShareCopy(context: string) {
  track("share_copy", { context });
}

/** Track when a referral code is captured from URL */
export function trackReferralCapture(code: string) {
  track("referral_capture", { code });
}

/** Track when a referral conversion is recorded */
export function trackReferralConversion(code: string) {
  track("referral_conversion", { code });
}

/** Track when a user signs in */
export function trackSignIn() {
  track("sign_in");
}

/** Track when a user joins a deliberation */
export function trackJoinDeliberation(deliberationId: string) {
  track("join_deliberation", { deliberation_id: deliberationId });
}

/** Track when a user creates a deliberation */
export function trackCreateDeliberation() {
  track("create_deliberation");
}

/** Track when a user creates a hosted agent */
export function trackCreateAgent() {
  track("create_agent");
}

/** Track when a user joins a community */
export function trackJoinCommunity(communityId: string) {
  track("join_community", { community_id: communityId });
}

/** Track page-level engagement */
export function trackPageAction(action: string, props?: Record<string, string>) {
  track(action, props);
}
