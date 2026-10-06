import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  endpointKey, outcomeFor, errorClassFor, utcDay, recordApiRequest, flushApiUsage, aggregateEvents,
  startApiUsageFlusher, stopApiUsageFlusher, bufferedCount, droppedCount, resetApiUsageForTests, type ApiRequestEvent,
} from "./usage.js";

const ev = (over: Partial<ApiRequestEvent> = {}): ApiRequestEvent => ({
  method: "POST", routeUrl: "/v1/Account/:authId/Message/", statusCode: 202, durationMs: 10, requestId: "req-1",
  messages: 1, organizationId: "org-1", apiKeyId: "key-1", ...over,
});

function fakePrisma(opts: { failTx?: boolean; delayMs?: number } = {}) {
  const createMany = vi.fn(async (_a: unknown) => ({ count: 0 }));
  const executeRaw = vi.fn(async (..._a: unknown[]) => 1);
  const tx = { apiRequestLog: { createMany }, $executeRaw: executeRaw };
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.failTx) throw Object.assign(new Error("secret phone +14155552671"), { code: "P2002" });
    return fn(tx);
  });
  return { prisma: { $transaction: transaction } as unknown as PrismaClient, createMany, executeRaw, transaction };
}

describe("pure helpers", () => {
  it("endpointKey maps route patterns, never ids", () => {
    expect(endpointKey("POST", "/v1/Account/:authId/Message/")).toBe("message.send");
    expect(endpointKey("POST", "/v1/Account/:authId/Message")).toBe("message.send");
    expect(endpointKey("GET", "/v1/Account/:authId/Message/")).toBe("message.list");
    expect(endpointKey("GET", "/v1/Account/:authId/Message/:uuid/")).toBe("message.get");
    expect(endpointKey("get", "/v1/Account/:authId/Message/:uuid")).toBe("message.get");
    expect(endpointKey("DELETE", "/v1/Account/:authId/Message/")).toBe("other");
    expect(endpointKey("GET", undefined)).toBe("other");
    expect(endpointKey("GET", "/v1/Account/abc/Nope")).toBe("other");
  });
  it("outcomeFor", () => {
    expect(outcomeFor(200)).toBe("success");
    expect(outcomeFor(202)).toBe("success");
    expect(outcomeFor(399)).toBe("success");
    expect(outcomeFor(400)).toBe("client_error");
    expect(outcomeFor(499)).toBe("client_error");
    expect(outcomeFor(500)).toBe("server_error");
    expect(outcomeFor(503)).toBe("server_error");
  });
  it("errorClassFor", () => {
    expect(errorClassFor(202)).toBeNull();
    expect(errorClassFor(400)).toBe("validation");
    expect(errorClassFor(422)).toBe("validation");
    expect(errorClassFor(401)).toBe("auth");
    expect(errorClassFor(403)).toBe("access");
    expect(errorClassFor(404)).toBe("not_found");
    expect(errorClassFor(429)).toBe("rate_limited");
    expect(errorClassFor(413)).toBe("client");
    expect(errorClassFor(500)).toBe("server");
    expect(errorClassFor(502)).toBe("server");
  });
  it("utcDay handles the day boundary", () => {
    expect(utcDay(new Date("2026-10-06T23:59:59.999Z"))).toBe("2026-10-06");
    expect(utcDay(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
  });
});

describe("aggregateEvents", () => {
  it("groups per (org,key,day,endpoint) and counts every outcome", () => {
    const at = new Date("2026-10-06T10:00:00Z");
    const mk = (statusCode: number, durationMs: number, over: Partial<ApiRequestEvent> = {}) =>
      ({ ...ev({ statusCode, durationMs, ...over }), at });
    const groups = aggregateEvents([
      mk(202, 10, { messages: 2 }), mk(400, 30), mk(401, 5), mk(429, 1), mk(500, 100),
      mk(200, 7, { method: "GET", messages: 0 }),
      mk(202, 10, { organizationId: "org-2", apiKeyId: "key-9" }),
      mk(202, 10, { organizationId: null, apiKeyId: null }), // unattributed: no rollup
      mk(202, 10, { apiKeyId: null }), // org without credential: no rollup
    ]);
    expect(groups).toHaveLength(3);
    const g = groups.find((x) => x.organizationId === "org-1" && x.endpoint === "message.send")!;
    expect(g).toMatchObject({
      apiKeyId: "key-1", day: "2026-10-06", requests: 5, success: 1, clientErrors: 3, serverErrors: 1,
      rateLimited: 1, authFailures: 1, messages: 6, durationMsSum: 146, durationMsMax: 100,
    });
    expect(g.success + g.clientErrors + g.serverErrors).toBe(g.requests);
    expect(groups.find((x) => x.endpoint === "message.list")).toMatchObject({ requests: 1, success: 1 });
  });
  it("splits groups at the UTC day boundary", () => {
    const groups = aggregateEvents([
      { ...ev(), at: new Date("2026-10-06T23:59:59.999Z") }, { ...ev(), at: new Date("2026-10-07T00:00:00.000Z") },
    ]);
    expect(groups.map((g) => g.day).sort()).toEqual(["2026-10-06", "2026-10-07"]);
  });
});

describe("recorder and flush", () => {
  beforeEach(() => { resetApiUsageForTests(); delete process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"]; });
  afterEach(() => { stopApiUsageFlusher(); vi.restoreAllMocks(); vi.useRealTimers(); resetApiUsageForTests(); });

  it("recordApiRequest is synchronous, returns void and never throws on garbage", () => {
    expect(recordApiRequest(ev())).toBeUndefined();
    expect(() => recordApiRequest(null as never)).not.toThrow();
    expect(() => recordApiRequest({ statusCode: "x" } as never)).not.toThrow();
    expect(bufferedCount()).toBe(1);
  });

  it("flush writes raw rows and one rollup upsert per group in ONE transaction, parameterized", async () => {
    const { prisma, createMany, executeRaw, transaction } = fakePrisma();
    recordApiRequest(ev());
    recordApiRequest(ev({ statusCode: 400 }));
    recordApiRequest(ev({ organizationId: null, apiKeyId: null, statusCode: 401 }));
    await flushApiUsage(prisma);
    expect(transaction).toHaveBeenCalledTimes(1);
    const rows = (createMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> }).data;
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ organizationId: null, apiKeyId: null, endpoint: "message.send", statusCode: 401, outcome: "client_error", errorClass: "auth" });
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["apiKeyId", "createdAt", "durationMs", "endpoint", "errorClass", "id", "messages", "method", "organizationId", "outcome", "requestId", "statusCode"]);
    expect(executeRaw).toHaveBeenCalledTimes(1); // only the attributed group
    const [strings, ...values] = executeRaw.mock.calls[0]! as [string[], ...unknown[]];
    const sql = strings.join("?");
    expect(sql).toMatch(/INSERT INTO api_usage_daily/);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, api_key_id, day, endpoint\) DO UPDATE/);
    expect(sql).toMatch(/GREATEST\(api_usage_daily\.duration_ms_max, EXCLUDED\.duration_ms_max\)/);
    expect(sql).not.toContain("org-1");
    expect(values).toContain("org-1");
    expect(values).toContain("key-1");
    expect(bufferedCount()).toBe(0);
  });

  it("sampling affects raw rows only; rollups count everything; errors always raw", async () => {
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0";
    const { prisma, createMany, executeRaw } = fakePrisma();
    recordApiRequest(ev()); recordApiRequest(ev()); recordApiRequest(ev({ statusCode: 500 }));
    await flushApiUsage(prisma);
    const rows = (createMany.mock.calls[0]![0] as { data: unknown[] }).data;
    expect(rows).toHaveLength(1);
    const values = executeRaw.mock.calls[0]!.slice(1);
    expect(values).toContain(3); // requests counted for all three
  });

  it("sampling 1 logs all; 0.5 follows the random draw", async () => {
    const { prisma, createMany } = fakePrisma();
    recordApiRequest(ev()); recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect((createMany.mock.calls[0]![0] as { data: unknown[] }).data).toHaveLength(2);

    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0.5";
    const r = vi.spyOn(Math, "random");
    r.mockReturnValueOnce(0.2).mockReturnValueOnce(0.7);
    recordApiRequest(ev()); recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect((createMany.mock.calls[1]![0] as { data: unknown[] }).data).toHaveLength(1);
  });

  it("invalid sample rate falls back to 1", async () => {
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "abc";
    const { prisma, createMany } = fakePrisma();
    recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect((createMany.mock.calls[0]![0] as { data: unknown[] }).data).toHaveLength(1);
  });

  it("buffer cap drops the oldest and counts drops", async () => {
    const { prisma, createMany } = fakePrisma();
    for (let i = 0; i < 10_005; i++) recordApiRequest(ev({ requestId: `r${i}` }));
    expect(bufferedCount()).toBe(10_000);
    expect(droppedCount()).toBe(5);
    await flushApiUsage(prisma);
    const rows = (createMany.mock.calls[0]![0] as { data: Array<{ requestId: string }> }).data;
    expect(rows[0]!.requestId).toBe("r5");
  });

  it("concurrent flushes never double count", async () => {
    const { prisma, createMany, executeRaw } = fakePrisma({ delayMs: 20 });
    recordApiRequest(ev()); recordApiRequest(ev());
    await Promise.all([flushApiUsage(prisma), flushApiUsage(prisma)]);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("a failing flush is swallowed and logs only name/code", async () => {
    const { prisma } = fakePrisma({ failTx: true });
    const logger = { warn: vi.fn() };
    recordApiRequest(ev());
    await expect(flushApiUsage(prisma, logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("+1415");
    expect(JSON.stringify(logger.warn.mock.calls)).toContain("P2002");
  });

  it("flusher flushes periodically, at 200 events, and stop clears the timer", async () => {
    vi.useFakeTimers();
    process.env["API_USAGE_FLUSH_MS"] = "1000";
    const { prisma, createMany } = fakePrisma();
    startApiUsageFlusher(prisma, { warn: vi.fn() });
    recordApiRequest(ev());
    await vi.advanceTimersByTimeAsync(1000);
    expect(createMany).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 200; i++) recordApiRequest(ev());
    await vi.advanceTimersByTimeAsync(10);
    expect(createMany).toHaveBeenCalledTimes(2);
    stopApiUsageFlusher();
    recordApiRequest(ev());
    await vi.advanceTimersByTimeAsync(5000);
    expect(createMany).toHaveBeenCalledTimes(2);
    delete process.env["API_USAGE_FLUSH_MS"];
  });
});
