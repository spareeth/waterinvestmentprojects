import "server-only";

// Per-IP request limits for the auth server actions. In memory: Phase 1 runs a single app container
// (PLAN section 4). The per-email lockout in lockout.ts is stored in the database and survives restarts.

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  max: number;
  windowSeconds: number;
}

export const AUTH_RATE_LIMITS = {
  signIn: { max: 10, windowSeconds: 60 },
  secondStep: { max: 10, windowSeconds: 60 },
  enrol: { max: 10, windowSeconds: 60 },
  invitation: { max: 10, windowSeconds: 60 },
  register: { max: 5, windowSeconds: 60 * 10 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitKey = keyof typeof AUTH_RATE_LIMITS;

const windows = new Map<string, Window>();
const MAX_ENTRIES = 10_000;

/** Counts one request and returns false when the caller is over the limit. */
export function takeToken(
  key: RateLimitKey,
  ip: string | null,
  now: number = Date.now(),
): boolean {
  const rule = AUTH_RATE_LIMITS[key];
  const id = `${key}:${ip ?? "unknown"}`;
  const current = windows.get(id);
  if (!current || current.resetAt <= now) {
    if (windows.size >= MAX_ENTRIES) prune(now);
    windows.set(id, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= rule.max;
}

function prune(now: number): void {
  for (const [id, window] of windows) {
    if (window.resetAt <= now) windows.delete(id);
  }
  // Still full of live windows: drop the oldest entries rather than grow without bound.
  if (windows.size >= MAX_ENTRIES) {
    const excess = windows.size - MAX_ENTRIES + 1;
    let removed = 0;
    for (const id of windows.keys()) {
      if (removed >= excess) break;
      windows.delete(id);
      removed += 1;
    }
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  windows.clear();
}
