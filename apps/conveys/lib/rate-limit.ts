const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

interface Entry {
  count: number;
  resetAt: number;
}

const map = new Map<string, Entry>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = map.get(ip);
  if (!entry || entry.resetAt < now) {
    map.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

export function _resetForTesting(): void {
  map.clear();
}
