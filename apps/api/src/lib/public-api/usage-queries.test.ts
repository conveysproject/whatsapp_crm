import { describe, it, expect, vi } from "vitest";
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
    expect(s.range.granularity).toBe("day");
    expect(s.totals).toEqual({
      requests: 10, success: 7, clientErrors: 2, serverErrors: 1, rateLimited: 1, authFailures: 1, errorRate: 0.3,
      messages: 5, avgLatencyMs: 100, maxLatencyMs: 400,
    });
    expect(s.totals.success + s.totals.clientErrors + s.totals.serverErrors).toBe(s.totals.requests);
    expect(s.series).toHaveLength(30);
    expect(s.series.find((x) => x.t === "2026-10-06")).toEqual({ t: "2026-10-06", requests: 4, success: 3, errors: 1 });
    expect(s.series.find((x) => x.t === "2026-10-05")).toEqual({ t: "2026-10-05", requests: 0, success: 0, errors: 0 });
    expect(s.byEndpoint.map((e) => e.endpoint)).toEqual(["message.get", "message.send"]);
    expect(s.byCredential[0]).toMatchObject({ apiKeyId: "key-1", name: "Prod", revoked: false, lastUsedAt: "2026-10-06T08:00:00.000Z", requests: 10 });
    expect(s.messagesByStatus).toEqual({ queued: 3, sent: 0, delivered: 4, read: 0, failed: 1, undelivered: 0 });
    expect(s.topFailureReasons).toEqual([{ code: "131047", title: "Re-engagement", count: 3 }]);
    expect(queries.some((q) => q.sql.includes("api_usage_daily"))).toBe(true);
    expect(queries.some((q) => q.sql.includes("api_request_logs"))).toBe(false);
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
      requests: 0, success: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, errorRate: 0, messages: 0,
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
