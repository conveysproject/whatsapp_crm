/**
 * Data layer for GET /v1/billing/message-usage (see apps/api/src/routes/billing-message-usage.ts).
 * Normalisation never throws: a partial or malformed body degrades to safe defaults.
 */

export interface DailyCount { day: string; billable: number }
export interface BandView { name: string; from: number; to: number | null; inr: number | null; usd: number | null }
/** Prices appear only after the owner publishes them; until then the server sends just the free allowance. */
export type Plan =
  | { published: false; freeAllowance: number }
  | {
      published: true;
      freeAllowance: number;
      bands: BandView[];
      position: "free" | "band" | "above";
      current: BandView;
      remainingToNextBand: number | null;
      next: BandView | null;
      cap: { upTo: number; inr: number; usd: number };
    };
export interface ExpectedBill { messages: number; band: BandView }
export interface MessageUsage {
  month: string;
  billable: number;
  bySource: Record<string, number>;
  daily: DailyCount[];
  updatedAt: string | null;
  plan: Plan | null;
  expected: ExpectedBill | null;
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

function nullableNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

function normalizeBand(raw: unknown): BandView | null {
  if (!isRecord(raw) || typeof raw["name"] !== "string") return null;
  return { name: raw["name"], from: num(raw["from"]), to: nullableNum(raw["to"]), inr: nullableNum(raw["inr"]), usd: nullableNum(raw["usd"]) };
}

export function normalizePlan(raw: unknown): Plan | null {
  if (!isRecord(raw) || typeof raw["published"] !== "boolean") return null;
  const freeAllowance = num(raw["freeAllowance"]);
  if (!raw["published"]) return { published: false, freeAllowance };
  const bands = Array.isArray(raw["bands"]) ? raw["bands"].map(normalizeBand).filter((b): b is BandView => b !== null) : [];
  const current = normalizeBand(raw["current"]);
  const cap = isRecord(raw["cap"]) ? raw["cap"] : null;
  if (bands.length === 0 || !current || !cap) return { published: false, freeAllowance };
  const position = raw["position"] === "free" || raw["position"] === "above" ? raw["position"] : "band";
  return {
    published: true,
    freeAllowance,
    bands,
    position,
    current,
    remainingToNextBand: nullableNum(raw["remainingToNextBand"]),
    next: normalizeBand(raw["next"]),
    cap: { upTo: num(cap["upTo"]), inr: num(cap["inr"]), usd: num(cap["usd"]) },
  };
}

function normalizeExpected(raw: unknown): ExpectedBill | null {
  if (!isRecord(raw)) return null;
  const band = normalizeBand(raw["band"]);
  return band ? { messages: num(raw["messages"]), band } : null;
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
    plan: normalizePlan(raw["plan"]),
    expected: normalizeExpected(raw["expected"]),
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

/** "₹999" / "$12"; null (custom quote) becomes "Custom quote". */
export function formatInr(n: number | null): string {
  return n === null ? "Custom quote" : `₹${formatCount(n)}`;
}
export function formatUsd(n: number | null): string {
  return n === null ? "Custom quote" : `$${formatCount(n)}`;
}
export function bandRange(b: BandView): string {
  if (b.to === null) return `over ${formatCount(b.from - 1)}`;
  if (b.from === 0) return `up to ${formatCount(b.to)}`;
  return `${formatCount(b.from)} to ${formatCount(b.to)}`;
}
