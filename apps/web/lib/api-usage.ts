/**
 * Client helpers for the API usage dashboard endpoints (`/api/v1/api-usage/...`).
 * Pure functions + thin fetch wrappers so the logic is unit-testable.
 */

export type UsageRange = "24h" | "7d" | "30d";
export const USAGE_RANGES: ReadonlyArray<{ value: UsageRange; label: string }> = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
export const DEFAULT_RANGE: UsageRange = "7d";
export const REQUESTS_PAGE_SIZE = 20;

export type Granularity = "hour" | "day";

export interface UsageCounts {
  requests: number;
  success: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  authFailures: number;
  failedSignins: number;
  billableRequests: number;
  errorRate: number;
  messages: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
}

export interface SeriesPoint {
  t: string;
  requests: number;
  success: number;
  errors: number;
  failedSignins: number;
}

export interface EndpointUsage extends UsageCounts {
  endpoint: string;
}

export interface CredentialUsage extends UsageCounts {
  apiKeyId: string;
  name: string;
  revoked: boolean;
  lastUsedAt: string | null;
}

export const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed", "undelivered"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface FailureReason {
  code: string | null;
  title: string | null;
  count: number;
}

export interface UsageSummary {
  range: { from: string; to: string; granularity: Granularity; approximate: boolean };
  totals: UsageCounts;
  series: SeriesPoint[];
  byEndpoint: EndpointUsage[];
  byCredential: CredentialUsage[];
  messagesByStatus: Record<MessageStatus, number>;
  topFailureReasons: FailureReason[];
}

export interface RequestRow {
  id: string;
  createdAt: string;
  method: string;
  endpoint: string;
  statusCode: number;
  outcome: string;
  errorClass: string | null;
  durationMs: number;
  messages: number;
  requestId: string;
  apiKeyId: string | null;
}

export interface RequestsPage {
  data: RequestRow[];
  nextCursor: string | null;
}

export class ApiUsageError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiUsageError";
    this.code = code;
    this.status = status;
  }
}

export function isNotAvailable(err: unknown): boolean {
  return err instanceof ApiUsageError && err.code === "API_NOT_AVAILABLE";
}

/** Human-readable message for any thrown value; never exposes raw objects or stacks. */
export function messageForUsageError(err: unknown): string {
  if (err instanceof ApiUsageError) {
    if (err.code === "FORBIDDEN") return "You do not have permission to view API usage.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

// ---- normalisers (defensive: a missing/garbled field becomes 0 / null, never NaN) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function normalizeCounts(v: unknown): UsageCounts {
  const o = isObj(v) ? v : {};
  return {
    requests: num(o["requests"]),
    success: num(o["success"]),
    clientErrors: num(o["clientErrors"]),
    serverErrors: num(o["serverErrors"]),
    rateLimited: num(o["rateLimited"]),
    authFailures: num(o["authFailures"]),
    failedSignins: num(o["failedSignins"]),
    billableRequests: num(o["billableRequests"]),
    errorRate: num(o["errorRate"]),
    messages: num(o["messages"]),
    avgLatencyMs: num(o["avgLatencyMs"]),
    maxLatencyMs: num(o["maxLatencyMs"]),
  };
}

export function normalizeSummary(raw: unknown): UsageSummary {
  const o = isObj(raw) ? raw : {};
  const range = isObj(o["range"]) ? o["range"] : {};
  const status = isObj(o["messagesByStatus"]) ? o["messagesByStatus"] : {};
  const messagesByStatus = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, num(status[s])])) as Record<MessageStatus, number>;
  return {
    range: {
      from: str(range["from"]),
      to: str(range["to"]),
      granularity: range["granularity"] === "hour" ? "hour" : "day",
      approximate: range["approximate"] === true,
    },
    totals: normalizeCounts(o["totals"]),
    series: arr(o["series"]).filter(isObj).map((p) => ({
      t: str(p["t"]),
      requests: num(p["requests"]),
      success: num(p["success"]),
      errors: num(p["errors"]),
      failedSignins: num(p["failedSignins"]),
    })),
    byEndpoint: arr(o["byEndpoint"]).filter(isObj).map((e) => ({ endpoint: str(e["endpoint"], "other"), ...normalizeCounts(e) })),
    byCredential: arr(o["byCredential"]).filter(isObj).map((c) => ({
      apiKeyId: str(c["apiKeyId"]),
      name: str(c["name"], "Unknown credential"),
      revoked: c["revoked"] === true,
      lastUsedAt: strOrNull(c["lastUsedAt"]),
      ...normalizeCounts(c),
    })),
    messagesByStatus,
    topFailureReasons: arr(o["topFailureReasons"]).filter(isObj).map((r) => ({
      code: r["code"] === null || r["code"] === undefined ? null : String(r["code"]),
      title: strOrNull(r["title"]),
      count: num(r["count"]),
    })),
  };
}

export function normalizeRequestsPage(raw: unknown): RequestsPage {
  const o = isObj(raw) ? raw : {};
  return {
    data: arr(o["data"]).filter(isObj).map((r) => ({
      id: str(r["id"]),
      createdAt: str(r["createdAt"]),
      method: str(r["method"]),
      endpoint: str(r["endpoint"], "other"),
      statusCode: num(r["statusCode"]),
      outcome: str(r["outcome"]),
      errorClass: strOrNull(r["errorClass"]),
      durationMs: num(r["durationMs"]),
      messages: num(r["messages"]),
      requestId: str(r["requestId"]),
      apiKeyId: strOrNull(r["apiKeyId"]),
    })),
    nextCursor: typeof o["nextCursor"] === "string" && o["nextCursor"] !== "" ? o["nextCursor"] : null,
  };
}

// ---- math ----

/** success / requests as a 0..1 fraction; null when there were no requests. */
export function successRate(t: Pick<UsageCounts, "success" | "requests">): number | null {
  return t.requests > 0 ? t.success / t.requests : null;
}

/** Errors excluding failed sign-ins (same basis as the server's errorRate); never negative. */
export function errorCount(t: Pick<UsageCounts, "clientErrors" | "serverErrors" | "failedSignins">): number {
  return Math.max(0, t.clientErrors + t.serverErrors - t.failedSignins);
}

// ---- formatting ----

export function formatCount(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "0";
}

/** `0.1234` -> "12.3%"; whole numbers drop the decimal ("0%", "100%"); null -> an em dash. */
export function formatPercent(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  const pct = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms).toLocaleString("en-US")} ms`;
}

export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString();
}

// ---- labels ----

const ENDPOINT_LABELS: Record<string, string> = {
  "message.send": "Send message",
  "message.list": "List messages",
  "message.get": "Get message",
  other: "Other",
};

export function endpointLabel(key: string): string {
  return Object.hasOwn(ENDPOINT_LABELS, key) ? ENDPOINT_LABELS[key]! : "Other";
}

const ERROR_CLASS_LABELS: Record<string, string> = {
  validation: "Invalid request",
  auth: "Failed sign-in",
  access: "Access denied",
  not_found: "Not found",
  rate_limited: "Rate limited",
  client: "Client error",
  server: "Server error",
};

export function errorClassLabel(errorClass: string | null): string {
  if (!errorClass) return "—";
  return Object.hasOwn(ERROR_CLASS_LABELS, errorClass) ? ERROR_CLASS_LABELS[errorClass]! : "Error";
}

export function statusLabel(s: MessageStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- chart ----

export interface ChartBucket {
  t: string;
  label: string;
  success: number;
  errors: number;
  failedSignins: number;
  total: number;
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Day buckets are UTC dates (`2026-10-06` -> "10-06"); hour buckets are shown in the browser's local time. */
export function chartData(series: SeriesPoint[], granularity: Granularity): ChartBucket[] {
  return series.map((p) => ({
    t: p.t,
    label: granularity === "hour" ? hourLabel(p.t) : p.t.slice(5),
    success: p.success,
    errors: p.errors,
    failedSignins: p.failedSignins,
    total: p.success + p.errors + p.failedSignins,
  }));
}

export function isChartEmpty(buckets: ChartBucket[]): boolean {
  return buckets.every((b) => b.total === 0);
}

// ---- queries ----

export function summaryQuery(range: UsageRange, apiKeyId?: string | null): string {
  const p = new URLSearchParams({ range });
  if (apiKeyId) p.set("apiKeyId", apiKeyId);
  return p.toString();
}

export function requestsQuery(
  opts: { limit?: number; cursor?: string | null; apiKeyId?: string | null; endpoint?: string | null } = {},
): string {
  const p = new URLSearchParams({ outcome: "error", limit: String(opts.limit ?? REQUESTS_PAGE_SIZE) });
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.apiKeyId) p.set("apiKeyId", opts.apiKeyId);
  if (opts.endpoint) p.set("endpoint", opts.endpoint);
  return p.toString();
}

/** Appends a new page of rows, skipping ids already present. */
export function appendRows(existing: RequestRow[], next: RequestRow[]): RequestRow[] {
  const seen = new Set(existing.map((r) => r.id));
  return [...existing, ...next.filter((r) => !seen.has(r.id))];
}

// ---- fetch ----

async function getBody(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/api-usage${path}`);
  } catch {
    throw new ApiUsageError("NETWORK", "Network error. Check your connection and try again.", 0);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = isObj(body) && isObj(body["error"]) ? body["error"] : {};
    throw new ApiUsageError(
      typeof e["code"] === "string" ? e["code"] : "UNKNOWN",
      typeof e["message"] === "string" ? e["message"] : `Request failed (${res.status}).`,
      res.status,
    );
  }
  return body;
}

/**
 * The summary route currently sends the summary object itself (no `{ data }` envelope) while the other dashboard routes
 * use one; accept both so a later envelope change cannot blank the page.
 */
export function unwrapSummary(body: unknown): unknown {
  if (isObj(body) && !("totals" in body) && isObj(body["data"])) return body["data"];
  return body;
}

export async function fetchSummary(range: UsageRange, apiKeyId?: string | null): Promise<UsageSummary> {
  const body = await getBody(`/summary?${summaryQuery(range, apiKeyId)}`);
  return normalizeSummary(unwrapSummary(body));
}

export async function fetchFailedRequests(opts: { cursor?: string | null; apiKeyId?: string | null } = {}): Promise<RequestsPage> {
  return normalizeRequestsPage(await getBody(`/requests?${requestsQuery(opts)}`));
}
