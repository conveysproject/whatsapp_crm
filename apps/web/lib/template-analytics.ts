/**
 * Client helpers for the template analytics endpoint (`/api/v1/templates/:id/analytics`).
 * Pure functions + one thin fetch wrapper so the logic is unit-testable.
 */

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
export const ANALYTICS_RANGES: ReadonlyArray<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = "30d";

export function parseRange(v: string | null | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.some((r) => r.value === v) ? (v as AnalyticsRange) : DEFAULT_ANALYTICS_RANGE;
}

export const SOURCES = ["api", "dashboard", "campaign", "flow", "test", "unknown"] as const;
export type AnalyticsSource = (typeof SOURCES)[number];

export interface DailyPoint { day: string; sent: number; delivered: number; read: number; failed: number }
export interface FailureRow { code: string | null; title: string | null; message: string; count: number; share: number; lastSeenAt: string | null }
export interface SourceRow { source: AnalyticsSource; count: number }
export interface TemplateInfo {
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore: string | null;
  lastEditedAt: string | null;
  previewText: string;
}
export interface TemplateAnalytics {
  inProgress: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  readPercentage: number;
  rates: { delivery: number | null; read: number | null; failure: number | null };
  reach: { uniqueRecipients: number; lastSentAt: string | null };
  daily: DailyPoint[];
  failures: FailureRow[];
  sources: SourceRow[];
  template: TemplateInfo;
  range: AnalyticsRange;
  attributionNote: string | null;
}

export class AnalyticsError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AnalyticsError";
    this.code = code;
    this.status = status;
  }
}

/** Human-readable message for any thrown value; never exposes raw objects or stacks. */
export function messageForAnalyticsError(err: unknown): string {
  if (err instanceof AnalyticsError) {
    if (err.code === "FORBIDDEN") return "You do not have access to template analytics";
    if (err.code === "NOT_FOUND") return "Template not found";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

// ---- normalisers ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
const rate = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function normalizeAnalytics(raw: unknown): TemplateAnalytics {
  if (!isObj(raw) || !isObj(raw["data"])) {
    throw new AnalyticsError("INVALID_RESPONSE", "The analytics data came back in an unexpected format. Please try again.", 200);
  }
  const d = raw["data"];
  const rates = isObj(d["rates"]) ? d["rates"] : {};
  const reach = isObj(d["reach"]) ? d["reach"] : {};
  const t = isObj(d["template"]) ? d["template"] : {};
  return {
    inProgress: num(d["inProgress"]),
    sent: num(d["sent"]),
    delivered: num(d["delivered"]),
    read: num(d["read"]),
    failed: num(d["failed"]),
    readPercentage: num(d["readPercentage"]),
    rates: { delivery: rate(rates["delivery"]), read: rate(rates["read"]), failure: rate(rates["failure"]) },
    reach: { uniqueRecipients: num(reach["uniqueRecipients"]), lastSentAt: strOrNull(reach["lastSentAt"]) },
    daily: arr(d["daily"])
      .filter(isObj)
      .filter((p) => typeof p["day"] === "string" && p["day"] !== "")
      .map((p) => ({ day: p["day"] as string, sent: num(p["sent"]), delivered: num(p["delivered"]), read: num(p["read"]), failed: num(p["failed"]) })),
    failures: arr(d["failures"]).filter(isObj).map((f) => ({
      code: f["code"] === null || f["code"] === undefined ? null : String(f["code"]),
      title: strOrNull(f["title"]),
      message: str(f["message"]),
      count: num(f["count"]),
      share: num(f["share"]),
      lastSeenAt: strOrNull(f["lastSeenAt"]),
    })),
    sources: arr(d["sources"]).filter(isObj).map((s) => ({
      source: (SOURCES as readonly unknown[]).includes(s["source"]) ? (s["source"] as AnalyticsSource) : "unknown",
      count: num(s["count"]),
    })),
    template: {
      name: str(t["name"]),
      language: str(t["language"]),
      category: str(t["category"]),
      status: str(t["status"]),
      qualityScore: strOrNull(t["qualityScore"]),
      lastEditedAt: strOrNull(t["lastEditedAt"]),
      previewText: str(t["previewText"]),
    },
    range: parseRange(typeof d["range"] === "string" ? d["range"] : null),
    attributionNote: typeof d["attributionNote"] === "string" && d["attributionNote"] !== "" ? d["attributionNote"] : null,
  };
}

// ---- fetch ----

export async function fetchTemplateAnalytics(id: string, range: AnalyticsRange): Promise<TemplateAnalytics> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/templates/${encodeURIComponent(id)}/analytics?range=${range}`);
  } catch {
    throw new AnalyticsError("NETWORK", "Network error. Check your connection and try again.", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = isObj(body) && isObj(body["error"]) ? body["error"] : {};
    const fallback = res.status === 403 ? "FORBIDDEN" : res.status === 404 ? "NOT_FOUND" : "UNKNOWN";
    throw new AnalyticsError(
      typeof e["code"] === "string" ? e["code"] : fallback,
      typeof e["message"] === "string" ? e["message"] : `Request failed (${res.status}).`,
      res.status,
    );
  }
  return normalizeAnalytics(body);
}

// ---- formatting and helpers ----

/** `33.3` -> "33.3%"; null / non-finite -> an em dash (never NaN or a misleading 0%). */
export function formatRate(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`;
}

export function formatCount(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString();
}

/** Percentage lost between two funnel steps (one decimal); null when the previous step is 0. */
export function dropOffPercent(prev: number, next: number): number | null {
  if (!(prev > 0)) return null;
  return Math.max(0, Math.round(((prev - next) / prev) * 1000) / 10);
}

const SOURCE_LABELS: Record<AnalyticsSource, string> = {
  api: "API",
  dashboard: "Dashboard",
  campaign: "Campaign",
  flow: "Flow",
  test: "Test send",
  unknown: "Unknown / older",
};
export function sourceLabel(s: AnalyticsSource): string {
  return SOURCE_LABELS[s] ?? SOURCE_LABELS.unknown;
}

export function isEmptyAnalytics(a: TemplateAnalytics): boolean {
  return a.sent + a.failed + a.inProgress === 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`.trim();
}

/** Actual covered span for fixed ranges, e.g. "8 Oct to 15 Oct (UTC days)". "" when there is no data. */
export function dateSpanLabel(daily: DailyPoint[], range: AnalyticsRange): string {
  if (range === "all") return "All time";
  const first = daily[0];
  const last = daily[daily.length - 1];
  if (!first || !last) return "";
  if (first.day === last.day) return `${shortDay(first.day)} (UTC day)`;
  return `${shortDay(first.day)} to ${shortDay(last.day)} (UTC days)`;
}

// ---- CSV ----

/** Escapes one CSV cell and neutralises spreadsheet formula injection in text cells. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(a: TemplateAnalytics): string {
  const lines: string[] = [["day", "sent", "delivered", "read", "failed"].join(",")];
  for (const d of a.daily) lines.push([d.day, d.sent, d.delivered, d.read, d.failed].map(csvCell).join(","));
  lines.push("");
  lines.push(["code", "message", "count", "share", "last_seen"].join(","));
  for (const f of a.failures) lines.push([f.code, f.message, f.count, f.share, f.lastSeenAt].map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}`;
}

export function csvFileName(name: string, range: AnalyticsRange): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
  return `template-${safe}-analytics-${range}.csv`;
}

export function downloadCsv(a: TemplateAnalytics, range: AnalyticsRange): void {
  const blob = new Blob([toCsv(a)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(a.template.name, range);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
