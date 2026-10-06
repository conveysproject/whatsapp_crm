import { Prisma, type PrismaClient } from "@prisma/client";
import { utcDay } from "./usage.js";

/**
 * Read layer over the public API usage tables. THE source for the usage dashboard today and for quota/billing checks later.
 * EVERY query is scoped by organizationId; a given apiKeyId must belong to that organization (otherwise `null` is returned
 * and nothing is read). Parameterized queries only. BigInt values are converted to Number.
 */

export const HOURLY_MAX_MS = 48 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const MESSAGE_STATUSES = ["queued", "sent", "delivered", "read", "failed", "undelivered"] as const;

export interface UsageCounts {
  requests: number;
  success: number;
  clientErrors: number;
  serverErrors: number;
  rateLimited: number;
  authFailures: number;
  errorRate: number;
  messages: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
}

export interface UsageSummary {
  range: { from: string; to: string; granularity: "hour" | "day" };
  totals: UsageCounts;
  series: Array<{ t: string; requests: number; success: number; errors: number }>;
  byEndpoint: Array<{ endpoint: string } & UsageCounts>;
  byCredential: Array<{ apiKeyId: string; name: string; revoked: boolean; lastUsedAt: string | null } & UsageCounts>;
  messagesByStatus: Record<(typeof MESSAGE_STATUSES)[number], number>;
  topFailureReasons: Array<{ code: string | null; title: string | null; count: number }>;
}

interface AggRow {
  k?: string | null;
  requests: bigint | number | null;
  success: bigint | number | null;
  client_errors: bigint | number | null;
  server_errors: bigint | number | null;
  rate_limited: bigint | number | null;
  auth_failures: bigint | number | null;
  messages: bigint | number | null;
  duration_ms_sum: bigint | number | null;
  duration_ms_max: bigint | number | null;
}

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

function toCounts(r: Partial<AggRow> | undefined): UsageCounts {
  const requests = n(r?.requests);
  const clientErrors = n(r?.client_errors);
  const serverErrors = n(r?.server_errors);
  return {
    requests,
    success: n(r?.success),
    clientErrors,
    serverErrors,
    rateLimited: n(r?.rate_limited),
    authFailures: n(r?.auth_failures),
    errorRate: requests > 0 ? Math.round(((clientErrors + serverErrors) / requests) * 10000) / 10000 : 0,
    messages: n(r?.messages),
    avgLatencyMs: requests > 0 ? Math.round(n(r?.duration_ms_sum) / requests) : 0,
    maxLatencyMs: n(r?.duration_ms_max),
  };
}

// Static SQL fragments (constants, no user input) for the two sources.
const ROLLUP_AGG = Prisma.raw(
  "COALESCE(SUM(requests),0) AS requests, COALESCE(SUM(success),0) AS success, COALESCE(SUM(client_errors),0) AS client_errors, " +
  "COALESCE(SUM(server_errors),0) AS server_errors, COALESCE(SUM(rate_limited),0) AS rate_limited, " +
  "COALESCE(SUM(auth_failures),0) AS auth_failures, COALESCE(SUM(messages),0) AS messages, " +
  "COALESCE(SUM(duration_ms_sum),0) AS duration_ms_sum, COALESCE(MAX(duration_ms_max),0) AS duration_ms_max"
);
const RAW_AGG = Prisma.raw(
  "COUNT(*) AS requests, COUNT(*) FILTER (WHERE outcome = 'success') AS success, " +
  "COUNT(*) FILTER (WHERE outcome = 'client_error') AS client_errors, COUNT(*) FILTER (WHERE outcome = 'server_error') AS server_errors, " +
  "COUNT(*) FILTER (WHERE status_code = 429) AS rate_limited, COUNT(*) FILTER (WHERE status_code = 401) AS auth_failures, " +
  "COALESCE(SUM(messages),0) AS messages, COALESCE(SUM(duration_ms),0) AS duration_ms_sum, COALESCE(MAX(duration_ms),0) AS duration_ms_max"
);

function startOfUtcHour(d: Date): Date {
  return new Date(Math.floor(d.getTime() / 3600000) * 3600000);
}

/** Zero-filled series buckets so charts have no gaps. */
function bucketKeys(from: Date, to: Date, granularity: "hour" | "day"): string[] {
  const keys: string[] = [];
  if (granularity === "day") {
    for (let t = Date.parse(`${utcDay(from)}T00:00:00Z`); t <= Date.parse(`${utcDay(to)}T00:00:00Z`) && keys.length < 400; t += DAY_MS) {
      keys.push(new Date(t).toISOString().slice(0, 10));
    }
  } else {
    for (let t = startOfUtcHour(from).getTime(); t < to.getTime() && keys.length < 60; t += 3600000) {
      keys.push(new Date(t).toISOString().slice(0, 19) + "Z");
    }
  }
  return keys;
}

async function ownsKey(prisma: PrismaClient, organizationId: string, apiKeyId: string): Promise<boolean> {
  const row = await prisma.apiKey.findFirst({ where: { id: apiKeyId, organizationId }, select: { id: true } });
  return row !== null;
}

export async function getUsageSummary(
  prisma: PrismaClient,
  organizationId: string,
  opts: { from: Date; to: Date; apiKeyId?: string }
): Promise<UsageSummary | null> {
  const { from, to, apiKeyId } = opts;
  if (apiKeyId && !(await ownsKey(prisma, organizationId, apiKeyId))) return null;

  const granularity: "hour" | "day" = to.getTime() - from.getTime() <= HOURLY_MAX_MS ? "hour" : "day";
  const keyFilter = apiKeyId ? Prisma.sql`AND api_key_id = ${apiKeyId}` : Prisma.empty;

  // Day granularity reads the rollups (exact, every request counted). Hourly granularity reads the raw log, because a
  // window of <= 48 h does not align with UTC days (exact while API_REQUEST_LOG_SUCCESS_SAMPLE_RATE = 1; errors always exact).
  const src = granularity === "day"
    ? {
        table: Prisma.raw("api_usage_daily"),
        agg: ROLLUP_AGG,
        where: Prisma.sql`organization_id = ${organizationId} AND day >= ${utcDay(from)}::date AND day <= ${utcDay(to)}::date ${keyFilter}`,
        bucket: Prisma.raw("day::text"),
      }
    : {
        table: Prisma.raw("api_request_logs"),
        agg: RAW_AGG,
        where: Prisma.sql`organization_id = ${organizationId} AND created_at >= ${from} AND created_at < ${to} ${keyFilter}`,
        bucket: Prisma.raw(`to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`),
      };

  const grouped = (expr: Prisma.Sql) =>
    prisma.$queryRaw<AggRow[]>(Prisma.sql`SELECT ${expr} AS k, ${src.agg} FROM ${src.table} WHERE ${src.where} GROUP BY k ORDER BY k`);

  const failureKeyFilter = apiKeyId ? Prisma.sql`AND a.api_key_id = ${apiKeyId}` : Prisma.empty;
  const [totalRows, seriesRows, endpointRows, credRows, statusRows, failureRows] = await Promise.all([
    prisma.$queryRaw<AggRow[]>(Prisma.sql`SELECT ${src.agg} FROM ${src.table} WHERE ${src.where}`),
    grouped(src.bucket),
    grouped(Prisma.raw("endpoint")),
    grouped(Prisma.raw("api_key_id")),
    prisma.apiMessageMeta.groupBy({
      by: ["lastStatus"],
      where: { organizationId, queuedAt: { gte: from, lt: to }, ...(apiKeyId ? { apiKeyId } : {}) },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ code: string | null; title: string | null; count: bigint | number }>>(Prisma.sql`
      SELECT m.delivery_error->>'code' AS code, m.delivery_error->>'title' AS title, COUNT(*) AS count
      FROM api_message_meta a
      JOIN messages m ON m.id = a.message_id AND m.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId} AND m.organization_id = ${organizationId}
        AND a.queued_at >= ${from} AND a.queued_at < ${to} ${failureKeyFilter}
        AND (a.last_status = 'failed' OR m.status = 'failed') AND m.delivery_error IS NOT NULL
      GROUP BY 1, 2 ORDER BY COUNT(*) DESC LIMIT 5`),
  ]);

  const seriesByKey = new Map<string, AggRow>();
  for (const r of seriesRows) if (r.k) seriesByKey.set(r.k, r);
  const series = bucketKeys(from, to, granularity).map((t) => {
    const c = toCounts(seriesByKey.get(t));
    return { t, requests: c.requests, success: c.success, errors: c.clientErrors + c.serverErrors };
  });

  const credIds = credRows.map((r) => r.k).filter((k): k is string => !!k);
  const creds = credIds.length
    ? await prisma.apiKey.findMany({
        where: { organizationId, id: { in: credIds } },
        select: { id: true, name: true, revokedAt: true, lastUsedAt: true },
      })
    : [];
  const credById = new Map(creds.map((c) => [c.id, c]));

  const messagesByStatus = Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])) as UsageSummary["messagesByStatus"];
  for (const r of statusRows) {
    const status = (r.lastStatus ?? "queued") as (typeof MESSAGE_STATUSES)[number];
    if (status in messagesByStatus) messagesByStatus[status] += r._count._all;
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString(), granularity },
    totals: toCounts(totalRows[0]),
    series,
    byEndpoint: endpointRows.filter((r) => r.k).map((r) => ({ endpoint: r.k as string, ...toCounts(r) })).sort((a, b) => b.requests - a.requests),
    byCredential: credRows
      .filter((r) => r.k)
      .map((r) => {
        const c = credById.get(r.k as string);
        return {
          apiKeyId: r.k as string,
          name: c?.name ?? "Unknown credential",
          revoked: !!c?.revokedAt,
          lastUsedAt: c?.lastUsedAt ? c.lastUsedAt.toISOString() : null,
          ...toCounts(r),
        };
      })
      .sort((a, b) => b.requests - a.requests),
    messagesByStatus,
    topFailureReasons: failureRows.map((r) => ({ code: r.code ?? null, title: r.title ?? null, count: n(r.count) })),
  };
}

// ---- recent requests (raw log) ----

export type OutcomeFilter = "success" | "client_error" | "server_error" | "error";

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

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

/** Returns null for anything that is not a cursor produced by encodeCursor. */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) return null;
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([A-Za-z0-9-]{1,64})$/.exec(text);
  if (!m) return null;
  const createdAt = new Date(m[1]!);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: m[2]! };
}

export async function listRequests(
  prisma: PrismaClient,
  organizationId: string,
  opts: { limit: number; cursor?: string; outcome?: OutcomeFilter; apiKeyId?: string; endpoint?: string }
): Promise<{ data: RequestRow[]; nextCursor: string | null } | null | "invalid_cursor"> {
  const { limit, cursor, outcome, apiKeyId, endpoint } = opts;
  if (apiKeyId && !(await ownsKey(prisma, organizationId, apiKeyId))) return null;
  const c = cursor ? decodeCursor(cursor) : undefined;
  if (cursor && !c) return "invalid_cursor";

  const rows = await prisma.apiRequestLog.findMany({
    where: {
      organizationId,
      ...(apiKeyId ? { apiKeyId } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(outcome ? { outcome: outcome === "error" ? { in: ["client_error", "server_error"] } : outcome } : {}),
      ...(c ? { OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({
      id: r.id, createdAt: r.createdAt.toISOString(), method: r.method, endpoint: r.endpoint, statusCode: r.statusCode,
      outcome: r.outcome, errorClass: r.errorClass, durationMs: r.durationMs, messages: r.messages, requestId: r.requestId,
      apiKeyId: r.apiKeyId,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
