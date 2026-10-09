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

/**
 * Validates the shape of a summary response (the contract) and tolerantly normalises its numbers. A body without a
 * `totals` object, a `range` object and a `series` array is NOT a summary (e.g. `{}` or an HTML error page): it throws
 * so the page shows its error state instead of a misleading all-zero dashboard.
 */
export function normalizeSummary(raw: unknown): UsageSummary {
  if (!isObj(raw) || !isObj(raw["totals"]) || !isObj(raw["range"]) || !Array.isArray(raw["series"])) {
    throw new ApiUsageError("INVALID_RESPONSE", "The usage data came back in an unexpected format. Please try again.", 200);
  }
  const o = raw;
  const range = raw["range"];
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
  "template.create": "Create template",
  "template.list": "List templates",
  "template.get": "Get template",
  "template.update": "Update template",
  "template.delete": "Delete template",
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
  /** Axis label. Hourly buckets spanning two local days include the weekday ("Tue 3 PM"). */
  label: string;
  /** Unambiguous label for tooltips and the screen-reader table (always has the weekday / date). */
  fullLabel: string;
  success: number;
  errors: number;
  failedSignins: number;
  total: number;
}

function validDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when the hourly buckets cover more than one LOCAL calendar day. */
export function spansLocalDays(series: SeriesPoint[]): boolean {
  const days = new Set<string>();
  for (const p of series) {
    const d = validDate(p.t);
    if (d) days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return days.size > 1;
}

/** Local time of the first bucket / window start, e.g. "Tue, 3:42 PM". Empty string for an invalid date. */
export function formatWindowStart(iso: string): string {
  const d = validDate(iso);
  return d ? d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
}

/** Day buckets are UTC dates (`2026-10-06` -> "10-06"); hour buckets are shown in the browser's local time. */
export function chartData(series: SeriesPoint[], granularity: Granularity): ChartBucket[] {
  const multiDay = granularity === "hour" && spansLocalDays(series);
  return series.map((p) => {
    const d = granularity === "hour" ? validDate(p.t) : null;
    let label: string;
    let fullLabel: string;
    if (granularity === "hour") {
      if (!d) {
        label = p.t;
        fullLabel = p.t;
      } else {
        label = multiDay
          ? d.toLocaleString([], { weekday: "short", hour: "numeric" })
          : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        fullLabel = d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      }
    } else {
      label = p.t.slice(5);
      fullLabel = p.t;
    }
    return { t: p.t, label, fullLabel, success: p.success, errors: p.errors, failedSignins: p.failedSignins, total: p.success + p.errors + p.failedSignins };
  });
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
  opts: { limit?: number; cursor?: string | null; apiKeyId?: string | null; endpoint?: string | null; range?: UsageRange | null } = {},
): string {
  const p = new URLSearchParams({ outcome: "error", limit: String(opts.limit ?? REQUESTS_PAGE_SIZE) });
  if (opts.range) p.set("range", opts.range);
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.apiKeyId) p.set("apiKeyId", opts.apiKeyId);
  if (opts.endpoint) p.set("endpoint", opts.endpoint);
  return p.toString();
}

/** Credential column text: "—" when the request is unattributed, "Other credential" when the id is not in the known names. */
export function credentialDisplayName(apiKeyId: string | null, names: ReadonlyMap<string, string>): string {
  if (!apiKeyId) return "—";
  return names.get(apiKeyId) ?? "Other credential";
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

export async function fetchFailedRequests(opts: { cursor?: string | null; apiKeyId?: string | null; range?: UsageRange | null } = {}): Promise<RequestsPage> {
  return normalizeRequestsPage(await getBody(`/requests?${requestsQuery(opts)}`));
}

// ---- stored request payloads and callback attempts ----

export const PAYLOAD_PAGE_SIZE = 20;
export const PAYLOAD_BODY_LIMIT_LABEL = "16 KB";

export interface PayloadSummary {
  id: string;
  createdAt: string;
  method: string;
  endpoint: string;
  statusCode: number;
  outcome: string;
  errorClass: string | null;
  errorCode: string | null;
  durationMs: number;
  apiKeyId: string | null;
}

export interface PayloadsPage {
  enabled: boolean;
  data: PayloadSummary[];
  nextCursor: string | null;
}

export interface PayloadDetail {
  id: string;
  requestBody: string | null;
  responseBody: string | null;
  requestTruncated: boolean;
  responseTruncated: boolean;
  queryString: string | null;
  clientIp: string | null;
  userAgent: string | null;
}

export interface CallbackAttemptRow {
  id: string;
  createdAt: string;
  messageId: string;
  url: string;
  method: string;
  attempt: number;
  outcome: string;
  httpStatus: number | null;
  reason: string | null;
  durationMs: number;
}

export interface CallbackAttemptsPage {
  data: CallbackAttemptRow[];
  nextCursor: string | null;
}

const malformed = (): ApiUsageError =>
  new ApiUsageError("INVALID_RESPONSE", "The data came back in an unexpected format. Please try again.", 200);
const cursorOf = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function normalizePayloadsPage(raw: unknown): PayloadsPage {
  if (!isObj(raw) || !Array.isArray(raw["data"]) || typeof raw["enabled"] !== "boolean") throw malformed();
  return {
    enabled: raw["enabled"],
    data: raw["data"].filter(isObj).map((r) => ({
      id: str(r["id"]),
      createdAt: str(r["createdAt"]),
      method: str(r["method"]),
      endpoint: str(r["endpoint"], "other"),
      statusCode: num(r["statusCode"]),
      outcome: str(r["outcome"]),
      errorClass: strOrNull(r["errorClass"]),
      errorCode: strOrNull(r["errorCode"]),
      durationMs: num(r["durationMs"]),
      apiKeyId: strOrNull(r["apiKeyId"]),
    })),
    nextCursor: cursorOf(raw["nextCursor"]),
  };
}

export function normalizePayloadDetail(raw: unknown): PayloadDetail {
  if (!isObj(raw) || typeof raw["id"] !== "string" || raw["id"] === "") throw malformed();
  return {
    id: raw["id"],
    requestBody: strOrNull(raw["requestBody"]),
    responseBody: strOrNull(raw["responseBody"]),
    requestTruncated: raw["requestTruncated"] === true,
    responseTruncated: raw["responseTruncated"] === true,
    queryString: strOrNull(raw["queryString"]),
    clientIp: strOrNull(raw["clientIp"]),
    userAgent: strOrNull(raw["userAgent"]),
  };
}

export function normalizeCallbackAttemptsPage(raw: unknown): CallbackAttemptsPage {
  if (!isObj(raw) || !Array.isArray(raw["data"])) throw malformed();
  return {
    data: raw["data"].filter(isObj).map((r) => ({
      id: str(r["id"]),
      createdAt: str(r["createdAt"]),
      messageId: str(r["messageId"]),
      url: str(r["url"]),
      method: str(r["method"]),
      attempt: num(r["attempt"]),
      outcome: str(r["outcome"]),
      httpStatus: typeof r["httpStatus"] === "number" && Number.isFinite(r["httpStatus"]) ? r["httpStatus"] : null,
      reason: strOrNull(r["reason"]),
      durationMs: num(r["durationMs"]),
    })),
    nextCursor: cursorOf(raw["nextCursor"]),
  };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CALLBACK_OUTCOME_LABELS: Record<string, string> = {
  delivered: "Delivered",
  http_error: "HTTP error",
  network_error: "Network error",
  dropped: "Dropped",
};

export function callbackOutcomeLabel(outcome: string): string {
  return Object.hasOwn(CALLBACK_OUTCOME_LABELS, outcome) ? CALLBACK_OUTCOME_LABELS[outcome]! : "Unknown";
}

/** Pretty-prints a stored body when it is valid JSON; otherwise returns the raw text unchanged. Empty/null -> "". */
export function prettyBody(body: string | null): string {
  if (!body) return "";
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export async function fetchPayloads(opts: { cursor?: string | null; apiKeyId?: string | null } = {}): Promise<PayloadsPage> {
  const p = new URLSearchParams({ limit: String(PAYLOAD_PAGE_SIZE) });
  if (opts.cursor) p.set("cursor", opts.cursor);
  if (opts.apiKeyId) p.set("apiKeyId", opts.apiKeyId);
  return normalizePayloadsPage(await getBody(`/payloads?${p.toString()}`));
}

export async function fetchPayloadDetail(id: string): Promise<PayloadDetail> {
  return normalizePayloadDetail(await getBody(`/payloads/${encodeURIComponent(id)}`));
}

export async function fetchCallbackAttempts(opts: { messageId: string; cursor?: string | null }): Promise<CallbackAttemptsPage> {
  const p = new URLSearchParams({ messageId: opts.messageId, limit: String(PAYLOAD_PAGE_SIZE) });
  if (opts.cursor) p.set("cursor", opts.cursor);
  return normalizeCallbackAttemptsPage(await getBody(`/callbacks?${p.toString()}`));
}
