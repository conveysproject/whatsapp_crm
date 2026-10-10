/** Pure formatting for scripts/recompute-message-usage.ts. Prints day keys and counts only. */
export type StoredTotal = number | null | "n/a"; // null = no stored rows for the day, "n/a" = stored table not available

function storedText(stored: StoredTotal): string {
  return stored === null ? "none" : String(stored);
}

export function formatDryRunLine(day: string, orgs: number, billable: number, stored: StoredTotal): string {
  let delta: string;
  if (stored === "n/a") delta = "n/a";
  else {
    const d = billable - (stored ?? 0);
    delta = d > 0 ? `+${d}` : String(d);
  }
  return `DRY RUN: ${day} orgs=${orgs} billable=${billable} stored=${storedText(stored)} delta=${delta}`;
}

export function formatApplyLine(day: string, upserted: number, removed: number, was: StoredTotal): string {
  return `APPLY: ${day} upserted=${upserted} removed=${removed} was=${storedText(was)}`;
}
