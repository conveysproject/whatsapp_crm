export type DashRange = "today" | "7d" | "30d";
const DAYS: Record<Exclude<DashRange, "today">, number> = { "7d": 7, "30d": 30 };

export function parseRange(v: unknown): DashRange | null {
  if (v === undefined) return "7d";
  return v === "today" || v === "7d" || v === "30d" ? v : null;
}

export function isValidTz(tz: string): boolean {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// Offset (ms) of `tz` from UTC at instant `at`.
function offsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

function startOfDayInTz(now: Date, tz: string): Date {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  const localMidnightAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"));
  // Two-pass correction so the offset is taken at the target instant (DST-safe).
  let guess = new Date(localMidnightAsUtc - offsetMs(now, tz));
  guess = new Date(localMidnightAsUtc - offsetMs(guess, tz));
  return guess;
}

export function windowFor(range: DashRange, tz: string, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const start = range === "today" ? startOfDayInTz(now, tz) : new Date(now.getTime() - DAYS[range] * 86_400_000);
  const len = now.getTime() - start.getTime();
  return { start, end: now, prevStart: new Date(start.getTime() - len), prevEnd: start };
}
