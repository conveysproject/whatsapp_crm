// Bounded in-memory dedupe for shadow-mode warnings: one log per key per TTL.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const seen = new Map<string, number>();

export function shouldLogShadow(key: string, now: number = Date.now()): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < TTL_MS) return false;
  if (seen.size >= MAX_ENTRIES) {
    for (const [k, t] of seen) if (now - t >= TTL_MS) seen.delete(k);
    if (seen.size >= MAX_ENTRIES) seen.clear();
  }
  seen.set(key, now);
  return true;
}

export function resetShadowLogForTests(): void {
  seen.clear();
}

export function shadowLogSizeForTests(): number {
  return seen.size;
}
