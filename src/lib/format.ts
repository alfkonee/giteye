export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return date.toLocaleDateString();
}

export function truncateHash(hash: string, len = 7): string {
  return hash.slice(0, len);
}

export type StalenessTone = "fresh" | "recent" | "aging" | "stale";

/**
 * Buckets a timestamp into staleness tiers: under a week, under a month,
 * under three months, and older.
 */
export function stalenessTone(
  timestamp: string | null | undefined,
): { tone: StalenessTone; days: number } | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const tone: StalenessTone =
    days < 7 ? "fresh" : days < 30 ? "recent" : days < 90 ? "aging" : "stale";
  return { tone, days };
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
