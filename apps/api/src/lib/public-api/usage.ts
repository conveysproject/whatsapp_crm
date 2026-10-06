import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { safeErr } from "./safe-err.js";

/**
 * Public API usage recorder. One event per HTTP response, buffered in memory and flushed in batches so the response
 * path never waits for the database. Metadata only: no bodies, IPs, URL paths, phone numbers, tokens or message text.
 *
 * Metering rule (keep forever): one rollup increment per HTTP request at response time, in UTC days, independent of
 * the raw-log sampling rate.
 */

export type ApiOutcome = "success" | "client_error" | "server_error";
export type ApiErrorClass = "validation" | "auth" | "access" | "not_found" | "rate_limited" | "client" | "server";

export interface ApiRequestEvent {
  method: string;
  /** Route PATTERN (request.routeOptions.url), never the real URL. */
  routeUrl: string | undefined;
  statusCode: number;
  durationMs: number;
  requestId: string;
  /** Messages accepted by this request. */
  messages: number;
  organizationId?: string | null;
  apiKeyId?: string | null;
}

type BufferedEvent = ApiRequestEvent & { at: Date; raw: boolean };

export interface UsageGroup {
  organizationId: string;
  apiKeyId: string;
  day: string;
  endpoint: string;
  requests: number;
  success: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  authFailures: number;
  messages: number;
  durationMsSum: number;
  durationMsMax: number;
}

export interface UsageLogger { warn: (obj: object, msg: string) => void }

const MAX_BUFFER = 10_000;
const FLUSH_AT = 200;
const DEFAULT_FLUSH_MS = 5000;

// ---- pure helpers ----

/** Stable endpoint key from the route pattern. Never contains ids. */
export function endpointKey(method: string, routeUrl: string | undefined): string {
  const path = (routeUrl ?? "").replace(/^.*\/:authId/, "").replace(/\/+$/, "");
  const m = method.toUpperCase();
  if (path === "/Message" && m === "POST") return "message.send";
  if (path === "/Message" && m === "GET") return "message.list";
  if (path === "/Message/:uuid" && m === "GET") return "message.get";
  return "other";
}

export function outcomeFor(status: number): ApiOutcome {
  if (status < 400) return "success";
  return status < 500 ? "client_error" : "server_error";
}

export function errorClassFor(status: number): ApiErrorClass | null {
  if (status < 400) return null;
  if (status >= 500) return "server";
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "auth";
  if (status === 403) return "access";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "client";
}

/** UTC calendar day as YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sampleRate(): number {
  const raw = process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"];
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}

function flushIntervalMs(): number {
  const n = Number.parseInt(process.env["API_USAGE_FLUSH_MS"] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FLUSH_MS;
}

/** In-memory aggregation per (org, key, day, endpoint). Events without org AND credential are not rolled up. */
export function aggregateEvents(events: Array<ApiRequestEvent & { at: Date }>): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  for (const e of events) {
    if (!e.organizationId || !e.apiKeyId) continue;
    const day = utcDay(e.at);
    const endpoint = endpointKey(e.method, e.routeUrl);
    const key = JSON.stringify([e.organizationId, e.apiKeyId, day, endpoint]);
    let g = groups.get(key);
    if (!g) {
      g = {
        organizationId: e.organizationId, apiKeyId: e.apiKeyId, day, endpoint, requests: 0, success: 0, clientErrors: 0,
        serverErrors: 0, rateLimited: 0, authFailures: 0, messages: 0, durationMsSum: 0, durationMsMax: 0,
      };
      groups.set(key, g);
    }
    const outcome = outcomeFor(e.statusCode);
    g.requests += 1;
    if (outcome === "success") g.success += 1;
    else if (outcome === "client_error") g.clientErrors += 1;
    else g.serverErrors += 1;
    if (e.statusCode === 429) g.rateLimited += 1;
    if (e.statusCode === 401) g.authFailures += 1;
    g.messages += e.messages;
    g.durationMsSum += e.durationMs;
    g.durationMsMax = Math.max(g.durationMsMax, e.durationMs);
  }
  return [...groups.values()];
}

// ---- buffer ----

let buffer: BufferedEvent[] = [];
let dropped = 0;
let timer: NodeJS.Timeout | null = null;
let activePrisma: PrismaClient | null = null;
let activeLogger: UsageLogger | undefined;
let flushQueued = false;

export const bufferedCount = () => buffer.length;
export const droppedCount = () => dropped;

export function resetApiUsageForTests(): void {
  buffer = []; dropped = 0; flushQueued = false;
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Synchronous and exception-safe: recording must never affect a response. */
export function recordApiRequest(event: ApiRequestEvent): void {
  try {
    if (!event || typeof event.statusCode !== "number" || !Number.isFinite(event.statusCode)) return;
    const status = event.statusCode;
    const raw = status >= 400 ? true : sampleRate() >= 1 ? true : sampleRate() <= 0 ? false : Math.random() < sampleRate();
    buffer.push({
      method: String(event.method ?? ""),
      routeUrl: typeof event.routeUrl === "string" ? event.routeUrl : undefined,
      statusCode: status,
      durationMs: Math.max(0, Math.round(num(event.durationMs))),
      requestId: String(event.requestId ?? ""),
      messages: Math.max(0, Math.trunc(num(event.messages))),
      organizationId: event.organizationId ?? null,
      apiKeyId: event.apiKeyId ?? null,
      at: new Date(),
      raw,
    });
    if (buffer.length > MAX_BUFFER) {
      const over = buffer.length - MAX_BUFFER;
      buffer.splice(0, over);
      dropped += over;
    }
    if (buffer.length >= FLUSH_AT && activePrisma && !flushQueued) {
      flushQueued = true;
      const prisma = activePrisma;
      const logger = activeLogger;
      queueMicrotask(() => { flushQueued = false; void flushApiUsage(prisma, logger); });
    }
  } catch {
    /* recording is best-effort */
  }
}

/**
 * Writes the buffered events (raw rows + per-group rollup upserts) in ONE transaction. The buffer is swapped before any
 * await, so concurrent calls never double count. Never throws; a failed flush drops that batch (logged by name/code only).
 */
export async function flushApiUsage(prisma: PrismaClient, logger?: UsageLogger): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  const droppedNow = dropped;
  dropped = 0;
  try {
    const raws = batch.filter((e) => e.raw).map((e) => ({
      id: randomUUID(),
      organizationId: e.organizationId ?? null,
      apiKeyId: e.apiKeyId ?? null,
      method: e.method.toUpperCase(),
      endpoint: endpointKey(e.method, e.routeUrl),
      statusCode: e.statusCode,
      outcome: outcomeFor(e.statusCode),
      errorClass: errorClassFor(e.statusCode),
      durationMs: e.durationMs,
      messages: e.messages,
      requestId: e.requestId,
      createdAt: e.at,
    }));
    const groups = aggregateEvents(batch);
    await prisma.$transaction(async (tx) => {
      if (raws.length > 0) await tx.apiRequestLog.createMany({ data: raws });
      for (const g of groups) {
        await tx.$executeRaw`
          INSERT INTO api_usage_daily (organization_id, api_key_id, day, endpoint, requests, success, client_errors, server_errors,
            rate_limited, auth_failures, messages, duration_ms_sum, duration_ms_max, updated_at)
          VALUES (${g.organizationId}, ${g.apiKeyId}, ${g.day}::date, ${g.endpoint}, ${g.requests}, ${g.success}, ${g.clientErrors},
            ${g.serverErrors}, ${g.rateLimited}, ${g.authFailures}, ${g.messages}, ${g.durationMsSum}::bigint, ${g.durationMsMax}, now())
          ON CONFLICT (organization_id, api_key_id, day, endpoint) DO UPDATE SET
            requests = api_usage_daily.requests + EXCLUDED.requests,
            success = api_usage_daily.success + EXCLUDED.success,
            client_errors = api_usage_daily.client_errors + EXCLUDED.client_errors,
            server_errors = api_usage_daily.server_errors + EXCLUDED.server_errors,
            rate_limited = api_usage_daily.rate_limited + EXCLUDED.rate_limited,
            auth_failures = api_usage_daily.auth_failures + EXCLUDED.auth_failures,
            messages = api_usage_daily.messages + EXCLUDED.messages,
            duration_ms_sum = api_usage_daily.duration_ms_sum + EXCLUDED.duration_ms_sum,
            duration_ms_max = GREATEST(api_usage_daily.duration_ms_max, EXCLUDED.duration_ms_max),
            updated_at = now()`;
      }
    });
    if (droppedNow > 0) warn(logger, { dropped: droppedNow }, "api usage buffer overflowed; oldest events dropped");
  } catch (err) {
    warn(logger, { error: safeErr(err), lost: batch.length }, "api usage flush failed");
  }
}

function warn(logger: UsageLogger | undefined, obj: object, msg: string): void {
  try {
    if (logger) logger.warn(obj, msg);
    else console.warn(`[api-usage] ${msg}`, JSON.stringify(obj));
  } catch { /* never throw from logging */ }
}

export function startApiUsageFlusher(prisma: PrismaClient, logger?: UsageLogger): void {
  stopApiUsageFlusher();
  activePrisma = prisma;
  activeLogger = logger;
  timer = setInterval(() => { void flushApiUsage(prisma, logger); }, flushIntervalMs());
  timer.unref();
}

export function stopApiUsageFlusher(): void {
  if (timer) clearInterval(timer);
  timer = null;
  activePrisma = null;
  activeLogger = undefined;
}
