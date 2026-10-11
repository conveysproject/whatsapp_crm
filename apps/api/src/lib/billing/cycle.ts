/**
 * Per-customer billing cycles. A cycle starts at 00:00 UTC on the UTC day-of-month the organization was created and
 * ends at the same day of the next month (clamped to the month's last day when that day does not exist).
 */
export interface Cycle {
  start: Date;
  endExclusive: Date;
  /** Start date as YYYY-MM-DD: the identifier stored on alerts and statements. */
  key: string;
  days: number;
}

const DAY = 86_400_000;

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The cycle boundary that falls in the given month for an anchor day. */
function boundaryIn(year: number, month0: number, anchor: number): Date {
  return new Date(Date.UTC(year, month0, Math.min(anchor, daysInMonth(year, month0))));
}

export function anchorDayOf(createdAt: Date): number {
  return createdAt.getUTCDate();
}

export function cycleKey(start: Date): string {
  return start.toISOString().slice(0, 10);
}

/** The cycle that contains the instant `at`, for an organization created at `createdAt`. */
export function cycleContaining(createdAt: Date, at: Date): Cycle {
  const anchor = anchorDayOf(createdAt);
  let start = boundaryIn(at.getUTCFullYear(), at.getUTCMonth(), anchor);
  if (start.getTime() > at.getTime()) start = boundaryIn(at.getUTCFullYear(), at.getUTCMonth() - 1, anchor);
  const endExclusive = boundaryIn(start.getUTCFullYear(), start.getUTCMonth() + 1, anchor);
  return { start, endExclusive, key: cycleKey(start), days: Math.round((endExclusive.getTime() - start.getTime()) / DAY) };
}

/** The cycle before the given one. */
export function previousCycle(createdAt: Date, cycle: Cycle): Cycle {
  return cycleContaining(createdAt, new Date(cycle.start.getTime() - 1));
}

/**
 * The cycle that ended at 00:00 UTC on `day`, or null when `day` is not one of this organization's boundaries
 * or the organization did not exist for that whole cycle (it began before registration).
 */
export function cycleEndingOn(createdAt: Date, day: Date): Cycle | null {
  const today = cycleContaining(createdAt, day);
  if (today.start.getTime() !== day.getTime()) return null;
  const ended = previousCycle(createdAt, today);
  const registeredDay = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()));
  return ended.start.getTime() < registeredDay.getTime() ? null : ended;
}

/** Parse a cycle key (YYYY-MM-DD) back to its start date, or null. */
export function parseCycleKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || cycleKey(d) !== key ? null : d;
}
