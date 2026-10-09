import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { safeErr } from "./safe-err.js";
import { payloadSize, type PayloadSnapshot } from "./payload-capture.js";

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
  /** Public API request id (request.apiId); becomes the raw row id so the payload row can share it. */
  logId?: string;
  /** Redacted, capped request/response snapshot; only stored for attributed events whose raw row is written. */
  payload?: PayloadSnapshot;
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
/** Rows per createMany / groups per upsert statement: keeps the bind-parameter count far below Postgres' 65 535 limit. */
const RAW_CHUNK = 2000;
const UPSERT_CHUNK = 500;
/** flushApiUsage keeps flushing while events keep arriving, but never loops forever (shutdown must stay bounded). */
const MAX_DRAIN_LOOPS = 5;
const TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 } as const;
/** At most this many RAW rows per credential per minute for 401s (anyone can send `knownId:wrong`). Rollups count all. */
const AUTH_RAW_PER_MINUTE = 30;
const AUTH_RAW_MAP_MAX = 5000;
/**
 * Requests with NO organization (unknown credential id, pre-auth 429) share ONE per-minute budget of buffered events
 * (env API_UNATTRIBUTED_RAW_PER_MIN, default 300), so an unauthenticated flood cannot fill the DB or crowd customers' events
 * out of the buffer. They are in no rollup, so dropping them loses no metering.
 */
const DEFAULT_UNATTRIBUTED_PER_MINUTE = 300;
const UNATTRIBUTED_KEY = "__unattributed__";
/** In-memory cap on buffered payload text; over it events keep their metadata and only lose the payload. */
const MAX_PAYLOAD_BUFFER_BYTES = 20 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYLOAD_CHUNK = 200;
let payloadBytes = 0;
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;

// ---- pure helpers ----

/** Stable endpoint key from the route pattern. Never contains ids. */
export function endpointKey(method: string, routeUrl: string | undefined): string {
  const path = (routeUrl ?? "").replace(/^.*\/:authId/, "").replace(/\/+$/, "");
  const m = method.toUpperCase();
  if (path === "/Message" && m === "POST") return "message.send";
  if (path === "/Message" && m === "GET") return "message.list";
  if (path === "/Message/:uuid" && m === "GET") return "message.get";
  if (path === "/WhatsApp/Template/:wabaId" && m === "POST") return "template.create";
  if (path === "/WhatsApp/Template/:wabaId" && m === "GET") return "template.list";
  if (path === "/WhatsApp/Template/:wabaId/:templateId" && m === "GET") return "template.get";
  if (path === "/WhatsApp/Template/:wabaId/:templateId" && m === "POST") return "template.update";
  if (path === "/WhatsApp/Template/:wabaId/:templateId" && m === "DELETE") return "template.delete";
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

/** Parsed API_REQUEST_LOG_SUCCESS_SAMPLE_RATE (0..1, default 1). */
export function successSampleRate(): number {
  const raw = process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"];
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}

function positiveIntEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const flushIntervalMs = () => positiveIntEnv("API_USAGE_FLUSH_MS", DEFAULT_FLUSH_MS);

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
let unattributedDropped = 0;
let timer: NodeJS.Timeout | null = null;
let activePrisma: PrismaClient | null = null;
let activeLogger: UsageLogger | undefined;
let flushQueued = false;
/** The single flush currently running (single-flight). Never rejects. */
let inFlight: Promise<void> | null = null;
const authRawCounts = new Map<string, { minute: number; count: number }>();

export const bufferedCount = () => buffer.length;
export const droppedCount = () => dropped;
export const unattributedDroppedCount = () => unattributedDropped;

export function resetApiUsageForTests(): void {
  buffer = []; payloadBytes = 0; dropped = 0; unattributedDropped = 0; flushQueued = false; inFlight = null; authRawCounts.clear();
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Client-controlled values never reach the database verbatim: a safe request id, or a fresh UUID. */
export function sanitizeRequestId(v: unknown): string {
  return typeof v === "string" && REQUEST_ID_RE.test(v) ? v : randomUUID();
}

function sanitizeMethod(v: unknown): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "OTHER";
}

/** True while this key (a credential id, or the unattributed sentinel) is under its per-minute budget. Bounded memory. */
function allowAuthFailureRaw(apiKeyId: string, nowMs: number, limit = AUTH_RAW_PER_MINUTE): boolean {
  const minute = Math.floor(nowMs / 60_000);
  if (authRawCounts.size > AUTH_RAW_MAP_MAX) {
    for (const [k, v] of authRawCounts) if (v.minute !== minute) authRawCounts.delete(k);
    if (authRawCounts.size > AUTH_RAW_MAP_MAX) authRawCounts.clear();
  }
  const entry = authRawCounts.get(apiKeyId);
  if (!entry || entry.minute !== minute) {
    authRawCounts.set(apiKeyId, { minute, count: 1 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/** Synchronous and exception-safe: recording must never affect a response. */
export function recordApiRequest(event: ApiRequestEvent): void {
  try {
    if (!event || typeof event.statusCode !== "number" || !Number.isFinite(event.statusCode)) return;
    const status = event.statusCode;
    const apiKeyId = event.apiKeyId ?? null;
    const at = new Date();
    if (!event.organizationId && !allowAuthFailureRaw(UNATTRIBUTED_KEY, at.getTime(), positiveIntEnv("API_UNATTRIBUTED_RAW_PER_MIN", DEFAULT_UNATTRIBUTED_PER_MINUTE))) {
      unattributedDropped += 1;
      return;
    }
    let raw: boolean;
    if (status >= 400) {
      // Errors are always logged raw, except the flood-prone 401s on a real credential (capped per minute).
      raw = status === 401 && apiKeyId ? allowAuthFailureRaw(apiKeyId, at.getTime()) : true;
    } else {
      const rate = successSampleRate();
      raw = rate >= 1 ? true : rate <= 0 ? false : Math.random() < rate;
    }
    if (buffer.length >= MAX_BUFFER) {
      // O(1) overflow policy: drop the NEW event (the buffered batch is older and about to be flushed) and count it.
      dropped += 1;
      return;
    }
    const logId = typeof event.logId === "string" && UUID_RE.test(event.logId) ? event.logId : undefined;
    let payload = raw && logId && event.organizationId ? event.payload : undefined;
    if (payload) {
      const size = payloadSize(payload);
      if (payloadBytes + size > MAX_PAYLOAD_BUFFER_BYTES) payload = undefined;
      else payloadBytes += size;
    }
    buffer.push({
      method: sanitizeMethod(event.method),
      routeUrl: typeof event.routeUrl === "string" ? event.routeUrl : undefined,
      statusCode: status,
      durationMs: Math.max(0, Math.round(num(event.durationMs))),
      requestId: sanitizeRequestId(event.requestId),
      messages: Math.max(0, Math.trunc(num(event.messages))),
      organizationId: event.organizationId ?? null,
      apiKeyId,
      ...(logId ? { logId } : {}),
      ...(payload ? { payload } : {}),
      at,
      raw,
    });
    if (buffer.length >= FLUSH_AT && activePrisma && !flushQueued && !inFlight) {
      flushQueued = true;
      const prisma = activePrisma;
      const logger = activeLogger;
      queueMicrotask(() => { flushQueued = false; triggerFlush(prisma, logger); });
    }
  } catch {
    /* recording is best-effort */
  }
}

function startFlight(prisma: PrismaClient, logger?: UsageLogger): Promise<void> {
  const p: Promise<void> = flushBatch(prisma, logger).finally(() => { if (inFlight === p) inFlight = null; });
  inFlight = p;
  return p;
}

/** Timer / threshold trigger: skipped while a flush is running; the remaining events wait for the next trigger. */
function triggerFlush(prisma: PrismaClient, logger?: UsageLogger): void {
  if (inFlight || buffer.length === 0) return;
  void startFlight(prisma, logger);
}

/**
 * Flushes everything buffered, single-flight: awaits the flush already running, then flushes what remains (events
 * recorded meanwhile), up to MAX_DRAIN_LOOPS rounds. Used on shutdown. Never throws.
 *
 * Delivery guarantee: AT MOST ONCE. A failed batch is dropped, not retried (metering is best-effort; billing must
 * reconcile `messages` against `api_message_meta`). Client aborts are not counted (Fastify's onResponse does not fire).
 */
export async function flushApiUsage(prisma: PrismaClient, logger?: UsageLogger): Promise<void> {
  for (let i = 0; i < MAX_DRAIN_LOOPS; i++) {
    while (inFlight) await inFlight;
    if (buffer.length === 0) return;
    await startFlight(prisma, logger);
  }
}

/**
 * Shutdown sequence: flush at once (don't wait on the workers, in case they hang), AND flush again after the workers
 * close (events recorded while they drained). Single-flight makes the two flushes safe. Resolves when both are done or
 * after `capMs`, whichever is first; never rejects.
 */
export async function drainUsageOnShutdown(closeWorkers: () => Promise<unknown>, flush: () => Promise<void>, capMs = 10_000): Promise<void> {
  let capTimer: NodeJS.Timeout | undefined;
  const cap = new Promise<void>((resolve) => { capTimer = setTimeout(resolve, capMs); capTimer.unref(); });
  const drain = (async () => {
    const early = flush().catch(() => undefined);
    await Promise.allSettled([closeWorkers()]);
    await early;
    await flush();
  })().catch(() => undefined);
  await Promise.race([drain, cap]);
  if (capTimer) clearTimeout(capTimer);
}

/** Writes ONE batch (raw rows + one ordered multi-row rollup upsert) in ONE transaction. Never throws. */
async function flushBatch(prisma: PrismaClient, logger?: UsageLogger): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  payloadBytes = 0;
  const droppedNow = dropped;
  dropped = 0;
  const unattributedNow = unattributedDropped;
  unattributedDropped = 0;
  try {
    const raws = batch.filter((e) => e.raw).map((e) => ({
      id: e.logId ?? randomUUID(),
      organizationId: e.organizationId ?? null,
      apiKeyId: e.apiKeyId ?? null,
      method: e.method,
      endpoint: endpointKey(e.method, e.routeUrl),
      statusCode: e.statusCode,
      outcome: outcomeFor(e.statusCode),
      errorClass: errorClassFor(e.statusCode),
      durationMs: e.durationMs,
      messages: e.messages,
      requestId: e.requestId,
      createdAt: e.at,
    }));
    const payloads = batch.filter((e) => e.raw && e.payload && e.logId && e.organizationId).map((e) => ({
      id: e.logId as string,
      organizationId: e.organizationId as string,
      apiKeyId: e.apiKeyId ?? null,
      method: e.method,
      endpoint: endpointKey(e.method, e.routeUrl),
      statusCode: e.statusCode,
      outcome: outcomeFor(e.statusCode),
      errorClass: errorClassFor(e.statusCode),
      errorCode: e.payload!.errorCode,
      durationMs: e.durationMs,
      requestBody: e.payload!.requestBody,
      responseBody: e.payload!.responseBody,
      requestTruncated: e.payload!.requestTruncated,
      responseTruncated: e.payload!.responseTruncated,
      queryString: e.payload!.queryString,
      clientIp: e.payload!.clientIp,
      userAgent: e.payload!.userAgent,
      createdAt: e.at,
    }));
    const groups = sortGroups(aggregateEvents(batch));
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < raws.length; i += RAW_CHUNK) await tx.apiRequestLog.createMany({ data: raws.slice(i, i + RAW_CHUNK) });
      for (let i = 0; i < payloads.length; i += PAYLOAD_CHUNK) await tx.apiRequestPayload.createMany({ data: payloads.slice(i, i + PAYLOAD_CHUNK), skipDuplicates: true });
      for (let i = 0; i < groups.length; i += UPSERT_CHUNK) await tx.$executeRaw(upsertStatement(groups.slice(i, i + UPSERT_CHUNK)));
    }, TX_OPTIONS);
  } catch (err) {
    warn(logger, { error: safeErr(err), lost: batch.length }, "api usage flush failed");
  }
  if (droppedNow > 0) warn(logger, { dropped: droppedNow }, "api usage buffer overflowed; events dropped");
  if (unattributedNow > 0) warn(logger, { unattributedDropped: unattributedNow }, "unattributed api requests over the per-minute budget; events dropped");
}

/** Deterministic lock order: concurrent transactions touching the same rows always lock them in the same order. */
export function sortGroups(groups: UsageGroup[]): UsageGroup[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups].sort((a, b) =>
    cmp(a.organizationId, b.organizationId) || cmp(a.apiKeyId, b.apiKeyId) || cmp(a.day, b.day) || cmp(a.endpoint, b.endpoint));
}

/** ONE multi-row INSERT ... ON CONFLICT for already-sorted, key-unique groups (parameterized). */
export function upsertStatement(groups: UsageGroup[]): Prisma.Sql {
  const values = Prisma.join(groups.map((g) => Prisma.sql`(${g.organizationId}, ${g.apiKeyId}, ${g.day}::date, ${g.endpoint},
    ${g.requests}, ${g.success}, ${g.clientErrors}, ${g.serverErrors}, ${g.rateLimited}, ${g.authFailures}, ${g.messages},
    ${g.durationMsSum}::bigint, ${g.durationMsMax}, now())`));
  return Prisma.sql`
    INSERT INTO api_usage_daily (organization_id, api_key_id, day, endpoint, requests, success, client_errors, server_errors,
      rate_limited, auth_failures, messages, duration_ms_sum, duration_ms_max, updated_at)
    VALUES ${values}
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
  timer = setInterval(() => triggerFlush(prisma, logger), flushIntervalMs());
  timer.unref();
}

export function stopApiUsageFlusher(): void {
  if (timer) clearInterval(timer);
  timer = null;
  activePrisma = null;
  activeLogger = undefined;
}
