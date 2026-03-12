/**
 * Shared utility functions.
 */

/**
 * Human-readable relative time string (e.g. "5m ago", "2d ago").
 *
 * Accepts either an ISO date string or a Date object. Handles backend
 * timestamps that lack a timezone suffix by treating them as UTC.
 */
export function timeAgo(input: string | Date): string {
  let date: Date;
  if (typeof input === "string") {
    // Backend stores UTC timestamps without Z suffix — ensure UTC parsing
    const normalized =
      input.endsWith("Z") || input.includes("+") ? input : input + "Z";
    date = new Date(normalized);
  } else {
    date = input;
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
