/**
 * Data layer for GET /v1/billing/message-usage (see apps/api/src/routes/billing-message-usage.ts).
 * Normalisation never throws: a partial or malformed body degrades to safe defaults.
 */

export interface DailyCount { day: string; billable: number }
export interface MessageUsage {
  month: string;
  billable: number;
  bySource: Record<string, number>;
  daily: DailyCount[];
  updatedAt: string | null;
}

export const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

/** Customer-facing names for the `source` recorded on a message (NULL is reported as "unknown"). */
export const SOURCE_LABELS: Record<string, string> = {
  campaign: "Campaigns",
  flow: "Flows and automations",
  dashboard: "Sent from the inbox or dashboard",
  api: "API",
  test: "Test sends",
  unknown: "Other messages",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

export function normalizeMessageUsage(raw: unknown): MessageUsage | null {
  if (!isRecord(raw)) return null;
  const bySource: Record<string, number> = {};
  if (isRecord(raw["bySource"])) {
    for (const [k, v] of Object.entries(raw["bySource"])) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) bySource[k] = v;
    }
  }
  const daily: DailyCount[] = [];
  if (Array.isArray(raw["daily"])) {
    for (const d of raw["daily"]) {
      if (isRecord(d) && typeof d["day"] === "string") daily.push({ day: d["day"], billable: num(d["billable"]) });
    }
  }
  return {
    month: typeof raw["month"] === "string" ? raw["month"] : "",
    billable: num(raw["billable"]),
    bySource,
    daily,
    updatedAt: typeof raw["updatedAt"] === "string" ? raw["updatedAt"] : null,
  };
}

/** Largest first; zero counts are dropped. Unknown source keys keep their key as the label. */
export function sourceRows(bySource: Record<string, number>): Array<{ key: string; label: string; count: number }> {
  return Object.entries(bySource)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, label: SOURCE_LABELS[key] ?? key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** "2026-10" -> "October 2026"; anything else is returned unchanged. Locale-independent on purpose (no hydration drift). */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return m ? `${MONTH_NAMES[Number(m[2]) - 1]} ${m[1]}` : month;
}

/** Thousands separators with a fixed locale so server and browser render the same text. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Bar heights as whole percentages of the busiest day (at least 3 so a quiet day stays visible; 0 stays 0). */
export function barHeights(daily: DailyCount[]): number[] {
  const max = daily.reduce((m, d) => Math.max(m, d.billable), 0);
  return daily.map((d) => (d.billable <= 0 || max <= 0 ? 0 : Math.max(3, Math.round((d.billable / max) * 100))));
}

export async function fetchMessageUsage(getToken: () => Promise<string | null>, signal?: AbortSignal): Promise<MessageUsage | null> {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/v1/billing/message-usage`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
      signal,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return normalizeMessageUsage(isRecord(json) ? json["data"] : undefined);
  } catch {
    return null;
  }
}
