import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getUsageSummary, listRequests, encodeCursor, decodeCursor } from "./usage-queries.js";

interface SqlLike { sql: string; values: unknown[] }

function mockPrisma(opts: { ownsKey?: boolean; rows?: Record<string, unknown[]>; logs?: unknown[] } = {}) {
  const rows = opts.rows ?? {};
  const queries: SqlLike[] = [];
  const pick = (q: SqlLike): unknown[] => {
    if (q.sql.includes("delivery_error")) return rows["failures"] ?? [];
    if (q.sql.includes("endpoint AS k")) return rows["endpoint"] ?? [];
    if (q.sql.includes("api_key_id AS k")) return rows["credential"] ?? [];
    if (q.sql.includes("AS k")) return rows["series"] ?? [];
    return rows["totals"] ?? [];
  };
  const prisma = {
    apiKey: {
      findFirst: vi.fn(async () => (opts.ownsKey === false ? null : { id: "key-1" })),
      findMany: vi.fn(async () => [{ id: "key-1", name: "Prod", revokedAt: null, lastUsedAt: new Date("2026-10-06T08:00:00Z") }]),
    },
    apiMessageMeta: { groupBy: vi.fn(async () => [{ lastStatus: null, _count: { _all: 2 } }, { lastStatus: "queued", _count: { _all: 1 } }, { lastStatus: "delivered", _count: { _all: 4 } }, { lastStatus: "failed", _count: { _all: 1 } }]) },
    apiRequestLog: { findMany: vi.fn(async () => opts.logs ?? []) },
    $queryRaw: vi.fn(async (q: SqlLike) => { queries.push(q); return pick(q); }),
  };
  return { prisma: prisma as unknown as PrismaClient, p: prisma, queries };
}

const agg = (over: Record<string, unknown> = {}) => ({
  requests: 10n, success: 7n, client_errors: 2n, server_errors: 1n, rate_limited: 1n, auth_failures: 1n, messages: 5n,
  duration_ms_sum: 1000n, duration_ms_max: 400, ...over,
});

const range30d = { from: new Date("2026-09-07T00:00:00Z"), to: new Date("2026-10-06T12:00:00Z") };
const range24h = { from: new Date("2026-10-05T12:00:00Z"), to: new Date("2026-10-06T12:00:00Z") };

describe("getUsageSummary", () => {
  it("builds totals from rollups for day ranges, converts BigInt, computes errorRate and latency", async () => {
    const { prisma, queries } = mockPrisma({ rows: {
      totals: [agg()],
      series: [{ k: "2026-10-06", ...agg({ requests: 4n, success: 3n, client_errors: 1n, server_errors: 0n }) }],
      endpoint: [{ k: "message.send", ...agg() }, { k: "message.get", ...agg({ requests: 20n }) }],
      credential: [{ k: "key-1", ...agg() }],
      failures: [{ code: "131047", title: "Re-engagement", count: 3n }],
    } });
    const s = (await getUsageSummary(prisma, "org-1", range30d))!;
    expect(s.range).toEqual({ from: "2026-09-07T00:00:00.000Z", to: "2026-10-07T00:00:00.000Z", granularity: "day", approximate: false });
    expect(s.totals).toEqual({
      requests: 10, success: 7, clientErrors: 2, serverErrors: 1, rateLimited: 1, authFailures: 1, errorRate: 0.2222, failedSignins: 1, billableRequests: 8,
      messages: 5, avgLatencyMs: 100, maxLatencyMs: 400,
    });
    expect(s.totals.success + s.totals.clientErrors + s.totals.serverErrors).toBe(s.totals.requests);
    expect(s.series).toHaveLength(30);
    expect(s.series.find((x) => x.t === "2026-10-06")).toEqual({ t: "2026-10-06", requests: 4, success: 3, errors: 0, failedSignins: 1 });
    expect(s.series.find((x) => x.t === "2026-10-05")).toEqual({ t: "2026-10-05", requests: 0, success: 0, errors: 0, failedSignins: 0 });
    expect(s.byEndpoint.map((e) => e.endpoint)).toEqual(["message.get", "message.send"]);
    expect(s.byCredential[0]).toMatchObject({ apiKeyId: "key-1", name: "Prod", revoked: false, lastUsedAt: "2026-10-06T08:00:00.000Z", requests: 10 });
    expect(s.messagesByStatus).toEqual({ queued: 3, sent: 0, delivered: 4, read: 0, failed: 1, undelivered: 0 });
    expect(s.topFailureReasons).toEqual([{ code: "131047", title: "Re-engagement", count: 3 }]);
    expect(queries.some((q) => q.sql.includes("api_usage_daily"))).toBe(true);
    expect(queries.some((q) => q.sql.includes("api_request_logs"))).toBe(false);
  });


  it("series errors EXCLUDE auth failures (never negative) and failedSignins reports them, daily and hourly", async () => {
    const row = (k: string) => ({ k, ...agg({ requests: 10n, success: 4n, client_errors: 5n, server_errors: 1n, auth_failures: 3n }) });
    const day = await getUsageSummary(mockPrisma({ rows: { totals: [agg()], series: [row("2026-10-06")] } }).prisma, "org-1", range30d);
    expect(day!.series.find((x) => x.t === "2026-10-06")).toEqual({ t: "2026-10-06", requests: 10, success: 4, errors: 3, failedSignins: 3 });
    const hour = await getUsageSummary(mockPrisma({ rows: { totals: [agg()], series: [row("2026-10-06T10:00:00Z")] } }).prisma, "org-1",
      { from: new Date("2026-10-05T10:30:00Z"), to: new Date("2026-10-06T10:30:00Z") });
    expect(hour!.series.find((x) => x.t === "2026-10-06T10:00:00Z")).toEqual({ t: "2026-10-06T10:00:00Z", requests: 10, success: 4, errors: 3, failedSignins: 3 });
    // inconsistent counters (auth_failures > client_errors) clamp at 0
    const clamp = await getUsageSummary(mockPrisma({ rows: { totals: [agg()], series: [{ k: "2026-10-06", ...agg({ requests: 5n, client_errors: 1n, server_errors: 0n, auth_failures: 4n }) }] } }).prisma, "org-1", range30d);
    expect(clamp!.series.find((x) => x.t === "2026-10-06")).toMatchObject({ errors: 0, failedSignins: 4 });
  });
  it("uses the raw log with hourly buckets for a range <= 48h", async () => {
    const { prisma, queries } = mockPrisma({ rows: { totals: [agg()], series: [{ k: "2026-10-06T10:00:00Z", ...agg({ requests: 2n }) }] } });
    const s = (await getUsageSummary(prisma, "org-1", range24h))!;
    expect(s.range.granularity).toBe("hour");
    expect(s.series).toHaveLength(24);
    expect(s.series.find((x) => x.t === "2026-10-06T10:00:00Z")!.requests).toBe(2);
    expect(queries.some((q) => q.sql.includes("api_request_logs"))).toBe(true);
    expect(queries.some((q) => q.sql.includes("api_usage_daily"))).toBe(false);
  });

  it("an empty org returns zeros, not NaN", async () => {
    const { prisma } = mockPrisma();
    const s = (await getUsageSummary(prisma, "org-1", range30d))!;
    expect(s.totals).toEqual({
      requests: 0, success: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, errorRate: 0, failedSignins: 0, billableRequests: 0, messages: 0,
      avgLatencyMs: 0, maxLatencyMs: 0,
    });
    expect(s.byEndpoint).toEqual([]);
    expect(s.topFailureReasons).toEqual([]);
  });

  it("scopes EVERY query by organizationId (parameterized, never interpolated)", async () => {
    const { prisma, p, queries } = mockPrisma({ rows: { credential: [{ k: "key-1", ...agg() }] } });
    await getUsageSummary(prisma, "org-1", range30d);
    expect(queries.length).toBeGreaterThanOrEqual(5);
    for (const q of queries) {
      expect(q.sql).toMatch(/organization_id = \?/);
      expect(q.values).toContain("org-1");
      expect(q.sql).not.toContain("org-1");
    }
    expect(p.apiMessageMeta.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }));
    expect(p.apiKey.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }));
  });

  it("failure reasons join is org-scoped on both tables", async () => {
    const { prisma, queries } = mockPrisma();
    await getUsageSummary(prisma, "org-1", range30d);
    const q = queries.find((x) => x.sql.includes("delivery_error"))!;
    expect(q.sql).toMatch(/a\.organization_id = \?/);
    expect(q.sql).toMatch(/m\.organization_id = \?/);
    expect(q.sql).toMatch(/LIMIT 5/);
  });

  it("apiKeyId filter is verified against the org first; a foreign key yields null and reads nothing", async () => {
    const { prisma, p, queries } = mockPrisma({ ownsKey: false });
    expect(await getUsageSummary(prisma, "org-1", { ...range30d, apiKeyId: "foreign" })).toBeNull();
    expect(p.apiKey.findFirst).toHaveBeenCalledWith({ where: { id: "foreign", organizationId: "org-1" }, select: { id: true } });
    expect(queries).toHaveLength(0);
    expect(p.apiMessageMeta.groupBy).not.toHaveBeenCalled();
  });

  it("an owned apiKeyId filters every query", async () => {
    const { prisma, p, queries } = mockPrisma();
    await getUsageSummary(prisma, "org-1", { ...range30d, apiKeyId: "key-1" });
    for (const q of queries) expect(q.values).toContain("key-1");
    expect(p.apiMessageMeta.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ apiKeyId: "key-1" }) }));
  });
});

describe("billable requests and error rate", () => {
  const totalsOf = async (row: Record<string, unknown>) => (await getUsageSummary(mockPrisma({ rows: { totals: [agg(row)] } }).prisma, "org-1", range30d))!.totals;
  it("billableRequests = requests - authFailures - rateLimited; failedSignins = authFailures", async () => {
    const t = await totalsOf({ requests: 100n, success: 60n, client_errors: 40n, server_errors: 0n, auth_failures: 25n, rate_limited: 5n });
    expect(t.billableRequests).toBe(70);
    expect(t.failedSignins).toBe(25);
    expect(t.requests).toBe(100);
  });
  it("errorRate excludes auth failures from numerator and denominator", async () => {
    // (client 40 + server 10 - auth 25) / (100 - 25) = 25/75
    const t = await totalsOf({ requests: 100n, success: 50n, client_errors: 40n, server_errors: 10n, auth_failures: 25n, rate_limited: 0n });
    expect(t.errorRate).toBe(0.3333);
  });
  it("errorRate is 0 when every request was a failed sign-in, and never negative or NaN", async () => {
    const t = await totalsOf({ requests: 10n, success: 0n, client_errors: 10n, server_errors: 0n, auth_failures: 10n, rate_limited: 0n });
    expect(t.errorRate).toBe(0);
    expect(t.billableRequests).toBe(0);
    const empty = await totalsOf({ requests: 0n, success: 0n, client_errors: 0n, server_errors: 0n, auth_failures: 0n, rate_limited: 0n });
    expect(empty.errorRate).toBe(0);
  });
  it("billableRequests is never negative", async () => {
    const t = await totalsOf({ requests: 3n, success: 0n, client_errors: 3n, server_errors: 0n, auth_failures: 2n, rate_limited: 2n });
    expect(t.billableRequests).toBe(0);
  });
  it("applies to byEndpoint and byCredential rows too", async () => {
    const { prisma } = mockPrisma({ rows: { endpoint: [{ k: "message.send", ...agg() }], credential: [{ k: "key-1", ...agg() }] } });
    const s = (await getUsageSummary(prisma, "org-1", range30d))!;
    expect(s.byEndpoint[0]).toMatchObject({ billableRequests: 8, failedSignins: 1, errorRate: 0.2222 });
    expect(s.byCredential[0]).toMatchObject({ billableRequests: 8, failedSignins: 1, errorRate: 0.2222 });
  });
});

describe("range bounds (`to` is exclusive)", () => {
  const dayParams = (queries: SqlLike[]) => queries.find((q) => q.sql.includes("api_usage_daily") && q.sql.includes("day >="))!.values;
  it("a 00:00Z `to` does NOT include that day: 2026-09-01 .. 2026-10-01 has exactly 30 buckets and 09-30 is the last day", async () => {
    const { prisma, queries } = mockPrisma();
    const s = (await getUsageSummary(prisma, "org-1", { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") }))!;
    expect(s.series).toHaveLength(30);
    expect(s.series[0]!.t).toBe("2026-09-01");
    expect(s.series[29]!.t).toBe("2026-09-30");
    expect(s.series.some((x) => x.t === "2026-10-01")).toBe(false);
    expect(dayParams(queries)).toEqual(expect.arrayContaining(["2026-09-01", "2026-09-30"]));
    expect(dayParams(queries)).not.toContain("2026-10-01");
    expect(s.range).toMatchObject({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
  });
  it("a `to` one millisecond past midnight includes that day", async () => {
    const { prisma } = mockPrisma();
    const s = (await getUsageSummary(prisma, "org-1", { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00.001Z") }))!;
    expect(s.series).toHaveLength(31);
    expect(s.series[30]!.t).toBe("2026-10-01");
  });
  it("a mid-day range is widened to whole UTC days and EVERY part uses the effective window", async () => {
    const { prisma, p, queries } = mockPrisma();
    const s = (await getUsageSummary(prisma, "org-1", { from: new Date("2026-09-01T15:30:00Z"), to: new Date("2026-09-10T08:00:00Z") }))!;
    expect(s.range).toMatchObject({ from: "2026-09-01T00:00:00.000Z", to: "2026-09-11T00:00:00.000Z", granularity: "day" });
    const where = (p.apiMessageMeta.groupBy.mock.calls as unknown as Array<[{ where: { queuedAt: { gte: Date; lt: Date } } }]>)[0]![0].where;
    expect(where.queuedAt.gte.toISOString()).toBe(s.range.from);
    expect(where.queuedAt.lt.toISOString()).toBe(s.range.to);
    const failures = queries.find((q) => q.sql.includes("delivery_error"))!;
    expect(failures.values.filter((v) => v instanceof Date).map((d) => (d as Date).toISOString())).toEqual([s.range.from, s.range.to]);
    expect(s.series).toHaveLength(10);
  });
  it("hourly ranges keep their exact [from, to) bounds", async () => {
    const { prisma, queries } = mockPrisma();
    const s = (await getUsageSummary(prisma, "org-1", range24h))!;
    expect(s.range).toMatchObject({ from: range24h.from.toISOString(), to: range24h.to.toISOString(), granularity: "hour" });
    const q = queries.find((x) => x.sql.includes("api_request_logs"))!;
    expect(q.values.filter((v) => v instanceof Date)).toEqual([range24h.from, range24h.to]);
  });
});

describe("range.approximate", () => {
  afterEach(() => { delete process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"]; });
  it("is false by default and for day granularity regardless of sampling", async () => {
    expect((await getUsageSummary(mockPrisma().prisma, "org-1", range24h))!.range.approximate).toBe(false);
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0.1";
    expect((await getUsageSummary(mockPrisma().prisma, "org-1", range30d))!.range.approximate).toBe(false);
  });
  it("is true for hourly granularity when the success sample rate is below 1", async () => {
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0.5";
    expect((await getUsageSummary(mockPrisma().prisma, "org-1", range24h))!.range.approximate).toBe(true);
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0";
    expect((await getUsageSummary(mockPrisma().prisma, "org-1", range24h))!.range.approximate).toBe(true);
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "1";
    expect((await getUsageSummary(mockPrisma().prisma, "org-1", range24h))!.range.approximate).toBe(false);
  });
});

describe("listRequests", () => {
  const log = (i: number) => ({
    id: `id-${i}`, createdAt: new Date(`2026-10-06T10:00:0${i}.000Z`), method: "POST", endpoint: "message.send", statusCode: 400,
    outcome: "client_error", errorClass: "validation", durationMs: 5, messages: 0, requestId: "r", apiKeyId: "key-1", organizationId: "org-1",
  });

  it("is org-scoped, orders newest first, returns nextCursor when more rows exist", async () => {
    const { prisma, p } = mockPrisma({ logs: [log(3), log(2), log(1)] });
    const res = (await listRequests(prisma, "org-1", { limit: 2 })) as { data: Array<{ id: string }>; nextCursor: string | null };
    const arg = (p.apiRequestLog.findMany.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]![0];
    expect(arg["where"]).toMatchObject({ organizationId: "org-1" });
    expect(arg["take"]).toBe(3);
    expect(arg["orderBy"]).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(res.data.map((r) => r.id)).toEqual(["id-3", "id-2"]);
    expect(res.data[0]).not.toHaveProperty("organizationId");
    expect(decodeCursor(res.nextCursor!)).toEqual({ createdAt: new Date("2026-10-06T10:00:02.000Z"), id: "id-2" });
  });

  it("no nextCursor on the last page", async () => {
    const { prisma } = mockPrisma({ logs: [log(1)] });
    expect(await listRequests(prisma, "org-1", { limit: 2 })).toMatchObject({ nextCursor: null });
  });

  it("applies cursor, outcome (error = both), endpoint and key filters", async () => {
    const { prisma, p } = mockPrisma();
    const cursor = encodeCursor(new Date("2026-10-06T10:00:02.000Z"), "id-2");
    await listRequests(prisma, "org-1", { limit: 10, cursor, outcome: "error", endpoint: "message.send", apiKeyId: "key-1" });
    const where = (p.apiRequestLog.findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>)[0]![0].where;
    expect(where).toMatchObject({ organizationId: "org-1", apiKeyId: "key-1", endpoint: "message.send", outcome: { in: ["client_error", "server_error"] } });
    expect(where["OR"]).toEqual([{ createdAt: { lt: new Date("2026-10-06T10:00:02.000Z") } }, { createdAt: new Date("2026-10-06T10:00:02.000Z"), id: { lt: "id-2" } }]);
  });

  it("adds created_at >= from AND < to when a window is given, and keeps the cursor condition beside it", async () => {
    const { prisma, p } = mockPrisma();
    const from = new Date("2026-10-01T00:00:00.000Z");
    const to = new Date("2026-10-07T00:00:00.000Z");
    const cursor = encodeCursor(new Date("2026-10-06T10:00:02.000Z"), "id-2");
    await listRequests(prisma, "org-1", { limit: 10, from, to, cursor });
    const where = (p.apiRequestLog.findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>)[0]![0].where;
    expect(where).toMatchObject({ organizationId: "org-1", createdAt: { gte: from, lt: to } });
    // The cursor condition lives in OR (its own createdAt comparisons), so the window cannot be overwritten by it.
    expect(where["OR"]).toEqual([{ createdAt: { lt: new Date("2026-10-06T10:00:02.000Z") } }, { createdAt: new Date("2026-10-06T10:00:02.000Z"), id: { lt: "id-2" } }]);
  });

  it("supports a one-sided window and no createdAt bound without one", async () => {
    const { prisma, p } = mockPrisma();
    await listRequests(prisma, "org-1", { limit: 10, from: new Date("2026-10-01T00:00:00.000Z") });
    await listRequests(prisma, "org-1", { limit: 10 });
    const calls = p.apiRequestLog.findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>;
    expect(calls[0]![0].where["createdAt"]).toEqual({ gte: new Date("2026-10-01T00:00:00.000Z") });
    expect(calls[1]![0].where).not.toHaveProperty("createdAt");
  });

  it("single outcome is passed through", async () => {
    const { prisma, p } = mockPrisma();
    await listRequests(prisma, "org-1", { limit: 10, outcome: "server_error" });
    expect((p.apiRequestLog.findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>)[0]![0].where["outcome"]).toBe("server_error");
  });

  it("rejects malformed cursors and reads nothing", async () => {
    const { prisma, p } = mockPrisma();
    for (const bad of ["!!", "abc", Buffer.from("nope").toString("base64url"), "a".repeat(300)]) {
      expect(await listRequests(prisma, "org-1", { limit: 10, cursor: bad })).toBe("invalid_cursor");
    }
    expect(p.apiRequestLog.findMany).not.toHaveBeenCalled();
  });

  it("a foreign apiKeyId yields null and reads nothing", async () => {
    const { prisma, p } = mockPrisma({ ownsKey: false });
    expect(await listRequests(prisma, "org-1", { limit: 10, apiKeyId: "foreign" })).toBeNull();
    expect(p.apiRequestLog.findMany).not.toHaveBeenCalled();
  });
});
