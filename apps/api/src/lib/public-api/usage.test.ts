import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  endpointKey, outcomeFor, errorClassFor, utcDay, recordApiRequest, flushApiUsage, aggregateEvents,
  startApiUsageFlusher, stopApiUsageFlusher, bufferedCount, droppedCount, unattributedDroppedCount, drainUsageOnShutdown, resetApiUsageForTests, type ApiRequestEvent,
} from "./usage.js";

const ev = (over: Partial<ApiRequestEvent> = {}): ApiRequestEvent => ({
  method: "POST", routeUrl: "/v1/Account/:authId/Message/", statusCode: 202, durationMs: 10, requestId: "req-1",
  messages: 1, organizationId: "org-1", apiKeyId: "key-1", ...over,
});

function fakePrisma(opts: { failTx?: boolean; delayMs?: number } = {}) {
  const createMany = vi.fn(async (_a: unknown) => ({ count: 0 }));
  const executeRaw = vi.fn(async (..._a: unknown[]) => 1);
  const tx = { apiRequestLog: { createMany }, $executeRaw: executeRaw };
  let active = 0;
  let maxActive = 0;
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>, _options?: unknown) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.failTx) throw Object.assign(new Error("secret phone +14155552671"), { code: "P2002" });
      return await fn(tx);
    } finally {
      active -= 1;
    }
  });
  return { prisma: { $transaction: transaction } as unknown as PrismaClient, createMany, executeRaw, transaction, maxActive: () => maxActive };
}

describe("pure helpers", () => {
  it("endpointKey maps route patterns, never ids", () => {
    expect(endpointKey("POST", "/v1/Account/:authId/Message/")).toBe("message.send");
    expect(endpointKey("POST", "/v1/Account/:authId/Message")).toBe("message.send");
    expect(endpointKey("GET", "/v1/Account/:authId/Message/")).toBe("message.list");
    expect(endpointKey("GET", "/v1/Account/:authId/Message/:uuid/")).toBe("message.get");
    expect(endpointKey("get", "/v1/Account/:authId/Message/:uuid")).toBe("message.get");
    expect(endpointKey("POST", "/v1/Account/:authId/WhatsApp/Template/:wabaId/")).toBe("template.create");
    expect(endpointKey("GET", "/v1/Account/:authId/WhatsApp/Template/:wabaId/")).toBe("template.list");
    expect(endpointKey("GET", "/v1/Account/:authId/WhatsApp/Template/:wabaId/:templateId/")).toBe("template.get");
    expect(endpointKey("POST", "/v1/Account/:authId/WhatsApp/Template/:wabaId/:templateId")).toBe("template.update");
    expect(endpointKey("DELETE", "/v1/Account/:authId/WhatsApp/Template/:wabaId/:templateId/")).toBe("template.delete");
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

const PARAMS_PER_GROUP = 13;
type Stmt = { sql: string; values: unknown[] };
const stmtOf = (call: unknown[]): Stmt => call[0] as Stmt;
const rowsOf = (createMany: { mock: { calls: unknown[][] } }) =>
  createMany.mock.calls.flatMap((c) => (c[0] as { data: Array<Record<string, unknown>> }).data);

describe("recorder and flush", () => {
  beforeEach(() => { resetApiUsageForTests(); delete process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"]; });
  afterEach(() => { stopApiUsageFlusher(); vi.restoreAllMocks(); vi.useRealTimers(); resetApiUsageForTests(); });

  it("recordApiRequest is synchronous, returns void and never throws on garbage", () => {
    expect(recordApiRequest(ev())).toBeUndefined();
    expect(() => recordApiRequest(null as never)).not.toThrow();
    expect(() => recordApiRequest({ statusCode: "x" } as never)).not.toThrow();
    expect(bufferedCount()).toBe(1);
  });

  it("flush writes raw rows and ONE multi-row rollup upsert in ONE transaction, parameterized", async () => {
    const { prisma, createMany, executeRaw, transaction } = fakePrisma();
    recordApiRequest(ev());
    recordApiRequest(ev({ statusCode: 400 }));
    recordApiRequest(ev({ organizationId: null, apiKeyId: null, statusCode: 401 }));
    await flushApiUsage(prisma);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]![1]).toEqual({ timeout: 30_000, maxWait: 5_000 });
    const rows = rowsOf(createMany);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ organizationId: null, apiKeyId: null, endpoint: "message.send", statusCode: 401, outcome: "client_error", errorClass: "auth" });
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["apiKeyId", "createdAt", "durationMs", "endpoint", "errorClass", "id", "messages", "method", "organizationId", "outcome", "requestId", "statusCode"]);
    expect(executeRaw).toHaveBeenCalledTimes(1); // only the attributed group
    const { sql, values } = stmtOf(executeRaw.mock.calls[0]!);
    expect(sql).toMatch(/INSERT INTO api_usage_daily/);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, api_key_id, day, endpoint\) DO UPDATE/);
    expect(sql).toMatch(/GREATEST\(api_usage_daily\.duration_ms_max, EXCLUDED\.duration_ms_max\)/);
    expect(sql).not.toContain("org-1");
    expect(values).toContain("org-1");
    expect(values).toContain("key-1");
    expect(values).toHaveLength(PARAMS_PER_GROUP);
    expect(bufferedCount()).toBe(0);
  });

  it("upserts groups in a deterministic SORTED order (org, key, day, endpoint) regardless of arrival order", async () => {
    const { prisma, executeRaw } = fakePrisma();
    recordApiRequest(ev({ organizationId: "org-2", apiKeyId: "key-9" }));
    recordApiRequest(ev({ organizationId: "org-1", apiKeyId: "key-2" }));
    recordApiRequest(ev({ organizationId: "org-1", apiKeyId: "key-1", method: "GET", routeUrl: "/v1/Account/:authId/Message/" }));
    recordApiRequest(ev({ organizationId: "org-1", apiKeyId: "key-1" }));
    await flushApiUsage(prisma);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const { values } = stmtOf(executeRaw.mock.calls[0]!);
    const order: string[] = [];
    for (let i = 0; i < values.length; i += PARAMS_PER_GROUP) order.push([values[i], values[i + 1], values[i + 3]].join("|"));
    expect(order).toEqual(["org-1|key-1|message.list", "org-1|key-1|message.send", "org-1|key-2|message.send", "org-2|key-9|message.send"]);
  });

  it("splits a large rollup into statements of at most 500 groups, keeping the global sort order", async () => {
    const { prisma, executeRaw } = fakePrisma();
    for (let i = 1200; i > 0; i--) recordApiRequest(ev({ apiKeyId: `key-${String(i).padStart(5, "0")}` }));
    await flushApiUsage(prisma);
    const sizes = executeRaw.mock.calls.map((c) => stmtOf(c).values.length / PARAMS_PER_GROUP);
    expect(sizes).toEqual([500, 500, 200]);
    const keys = executeRaw.mock.calls.flatMap((c) => {
      const v = stmtOf(c).values; const out: unknown[] = [];
      for (let i = 0; i < v.length; i += PARAMS_PER_GROUP) out.push(v[i + 1]);
      return out as string[];
    });
    expect(keys).toEqual([...keys].sort());
  });

  it("sampling affects raw rows only; rollups count everything; errors always raw", async () => {
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0";
    const { prisma, createMany, executeRaw } = fakePrisma();
    recordApiRequest(ev()); recordApiRequest(ev()); recordApiRequest(ev({ statusCode: 500 }));
    await flushApiUsage(prisma);
    expect(rowsOf(createMany)).toHaveLength(1);
    expect(stmtOf(executeRaw.mock.calls[0]!).values).toContain(3); // requests counted for all three
  });

  it("sampling 1 logs all; 0.5 follows the random draw", async () => {
    const { prisma, createMany } = fakePrisma();
    recordApiRequest(ev()); recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect(rowsOf(createMany)).toHaveLength(2);

    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "0.5";
    const r = vi.spyOn(Math, "random");
    r.mockReturnValueOnce(0.2).mockReturnValueOnce(0.7);
    recordApiRequest(ev()); recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect(rowsOf(createMany)).toHaveLength(3);
  });

  it("invalid sample rate falls back to 1", async () => {
    process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"] = "abc";
    const { prisma, createMany } = fakePrisma();
    recordApiRequest(ev());
    await flushApiUsage(prisma);
    expect(rowsOf(createMany)).toHaveLength(1);
  });

  it("buffer cap drops the NEW event in O(1) and counts drops; the buffered batch is kept", async () => {
    const { prisma, createMany } = fakePrisma();
    for (let i = 0; i < 10_005; i++) recordApiRequest(ev({ requestId: `r${i}` }));
    expect(bufferedCount()).toBe(10_000);
    expect(droppedCount()).toBe(5);
    await flushApiUsage(prisma);
    const rows = rowsOf(createMany);
    expect(rows).toHaveLength(10_000);
    expect(rows[0]!["requestId"]).toBe("r0");
    expect(rows[9_999]!["requestId"]).toBe("r9999");
  });

  it("logs the dropped-event counter on a failed flush too", async () => {
    const { prisma } = fakePrisma({ failTx: true });
    const logger = { warn: vi.fn() };
    for (let i = 0; i < 10_002; i++) recordApiRequest(ev());
    await flushApiUsage(prisma, logger);
    const calls = logger.warn.mock.calls as Array<[Record<string, unknown>, string]>;
    expect(calls.some(([o]) => o["dropped"] === 2)).toBe(true);
    expect(calls.some(([o]) => o["lost"] === 10_000)).toBe(true);
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

  describe("single-flight", () => {
    it("timer ticks never start a second transaction while one is running; the remaining events wait for the next tick", async () => {
      vi.useFakeTimers();
      process.env["API_USAGE_FLUSH_MS"] = "1000";
      const f = fakePrisma({ delayMs: 3500 });
      startApiUsageFlusher(f.prisma, { warn: vi.fn() });
      recordApiRequest(ev({ requestId: "first" }));
      await vi.advanceTimersByTimeAsync(1000); // tx 1 starts, lasts until t=4500
      expect(f.transaction).toHaveBeenCalledTimes(1);
      recordApiRequest(ev({ requestId: "second" }));
      await vi.advanceTimersByTimeAsync(3000); // ticks at 2000, 3000, 4000 while tx 1 is still running
      expect(f.transaction).toHaveBeenCalledTimes(1);
      expect(f.maxActive()).toBe(1);
      expect(bufferedCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1500); // tx 1 done at 4500; tick at 5000 starts tx 2
      await vi.advanceTimersByTimeAsync(3600);
      expect(f.transaction).toHaveBeenCalledTimes(2);
      expect(f.maxActive()).toBe(1);
      expect(rowsOf(f.createMany).map((r) => r["requestId"])).toEqual(["first", "second"]);
      delete process.env["API_USAGE_FLUSH_MS"];
    });

    it("the 200-event threshold does not start an overlapping transaction either", async () => {
      vi.useFakeTimers();
      process.env["API_USAGE_FLUSH_MS"] = "100000";
      const f = fakePrisma({ delayMs: 500 });
      startApiUsageFlusher(f.prisma, { warn: vi.fn() });
      for (let i = 0; i < 200; i++) recordApiRequest(ev());
      await vi.advanceTimersByTimeAsync(10); // tx 1 running
      for (let i = 0; i < 600; i++) recordApiRequest(ev());
      await vi.advanceTimersByTimeAsync(100);
      expect(f.transaction).toHaveBeenCalledTimes(1);
      expect(f.maxActive()).toBe(1);
      delete process.env["API_USAGE_FLUSH_MS"];
    });

    it("shutdown flush awaits an in-flight flush and then flushes what was recorded meanwhile", async () => {
      const f = fakePrisma({ delayMs: 30 });
      recordApiRequest(ev({ requestId: "a" }));
      const first = flushApiUsage(f.prisma); // in flight
      recordApiRequest(ev({ requestId: "b" })); // recorded during the flush
      await flushApiUsage(f.prisma); // "shutdown": must not return before both are written
      expect(bufferedCount()).toBe(0);
      expect(f.maxActive()).toBe(1);
      expect(rowsOf(f.createMany).map((r) => r["requestId"])).toEqual(["a", "b"]);
      await first;
    });

    it("one flushApiUsage call loops until events recorded during the flush are drained", async () => {
      const f = fakePrisma({ delayMs: 20 });
      recordApiRequest(ev({ requestId: "a" }));
      setTimeout(() => recordApiRequest(ev({ requestId: "b" })), 5);
      await flushApiUsage(f.prisma);
      expect(bufferedCount()).toBe(0);
      expect(f.transaction).toHaveBeenCalledTimes(2);
      expect(rowsOf(f.createMany).map((r) => r["requestId"])).toEqual(["a", "b"]);
    });

    it("the drain loop is capped, so a steady stream cannot block shutdown forever", async () => {
      const f = fakePrisma({ delayMs: 5 });
      let n = 0;
      const t = setInterval(() => recordApiRequest(ev({ requestId: `s${n++}` })), 1);
      recordApiRequest(ev());
      await flushApiUsage(f.prisma);
      clearInterval(t);
      expect(f.transaction.mock.calls.length).toBeLessThanOrEqual(5);
    });
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

  describe("sanitising client-controlled text", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    it("keeps a safe request id and replaces anything else with a fresh UUID", async () => {
      const { prisma, createMany } = fakePrisma();
      const bad = ["x".repeat(16 * 1024), "has space", "line\nbreak", "nul\u0000byte", "", "a".repeat(65), "emoji-\u{1F600}", "pass:word=1"];
      recordApiRequest(ev({ requestId: "abc-123_DEF.4:5" }));
      recordApiRequest(ev({ requestId: "a".repeat(64) }));
      for (const requestId of bad) recordApiRequest(ev({ requestId }));
      recordApiRequest(ev({ requestId: undefined as never }));
      await flushApiUsage(prisma);
      const ids = rowsOf(createMany).map((r) => r["requestId"] as string);
      expect(ids[0]).toBe("abc-123_DEF.4:5");
      expect(ids[1]).toBe("a".repeat(64));
      for (const id of ids.slice(2)) expect(id).toMatch(UUID);
      expect(new Set(ids.slice(2)).size).toBe(ids.length - 2);
    });
    it("method is upper-case letters only and at most 10 chars; endpoint comes only from the fixed key set", async () => {
      const { prisma, createMany } = fakePrisma();
      recordApiRequest(ev({ method: "post" }));
      recordApiRequest(ev({ method: "x".repeat(500) }));
      recordApiRequest(ev({ method: "1;DROP" }));
      recordApiRequest(ev({ method: "", routeUrl: "/v1/Account/:authId/Evil'--" }));
      await flushApiUsage(prisma);
      const rows = rowsOf(createMany);
      expect(rows.map((r) => r["method"])).toEqual(["POST", "XXXXXXXXXX", "DROP", "OTHER"]);
      expect(rows.map((r) => r["endpoint"])).toEqual(["message.send", "other", "other", "other"]);
    });
  });

  describe("cap on unattributed raw rows (no organization)", () => {
    beforeEach(() => { delete process.env["API_UNATTRIBUTED_RAW_PER_MIN"]; });
    afterEach(() => { delete process.env["API_UNATTRIBUTED_RAW_PER_MIN"]; });
    const unattr = (over: Partial<ApiRequestEvent> = {}) => ev({ organizationId: null, apiKeyId: null, statusCode: 401, ...over });

    it("buffers at most 300 unattributed events per minute (default), counts the rest, and logs the counter on the next flush", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      const { prisma, createMany } = fakePrisma();
      const logger = { warn: vi.fn() };
      for (let i = 0; i < 350; i++) recordApiRequest(unattr());
      expect(bufferedCount()).toBe(300);
      expect(unattributedDroppedCount()).toBe(50);
      expect(droppedCount()).toBe(0);
      await flushApiUsage(prisma, logger);
      expect(rowsOf(createMany)).toHaveLength(300);
      const calls = logger.warn.mock.calls as Array<[Record<string, unknown>, string]>;
      expect(calls.some(([o]) => o["unattributedDropped"] === 50)).toBe(true);
      expect(unattributedDroppedCount()).toBe(0);
    });

    it("applies to undefined org too, and to 429s and other statuses", () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      process.env["API_UNATTRIBUTED_RAW_PER_MIN"] = "3";
      for (let i = 0; i < 2; i++) recordApiRequest(ev({ organizationId: undefined, apiKeyId: undefined, statusCode: 429 }));
      for (let i = 0; i < 3; i++) recordApiRequest(unattr({ statusCode: 500 }));
      expect(bufferedCount()).toBe(3);
      expect(unattributedDroppedCount()).toBe(2);
    });

    it("the budget refreshes in the next minute", () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      process.env["API_UNATTRIBUTED_RAW_PER_MIN"] = "5";
      for (let i = 0; i < 8; i++) recordApiRequest(unattr());
      vi.setSystemTime(new Date("2026-10-06T10:01:01Z"));
      for (let i = 0; i < 8; i++) recordApiRequest(unattr());
      expect(bufferedCount()).toBe(10);
      expect(unattributedDroppedCount()).toBe(6);
    });

    it("falls back to 300 on a missing/invalid/non-positive env value", () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      for (const bad of ["", "abc", "0", "-5"]) {
        resetApiUsageForTests();
        process.env["API_UNATTRIBUTED_RAW_PER_MIN"] = bad;
        for (let i = 0; i < 301; i++) recordApiRequest(unattr());
        expect(bufferedCount(), bad).toBe(300);
      }
    });

    it("is NOT applied to attributed events (neither raw rows nor rollups), and does not eat their budget", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      process.env["API_UNATTRIBUTED_RAW_PER_MIN"] = "2";
      const { prisma, createMany, executeRaw } = fakePrisma();
      for (let i = 0; i < 10; i++) recordApiRequest(unattr());
      for (let i = 0; i < 50; i++) recordApiRequest(ev({ statusCode: 202 }));
      for (let i = 0; i < 50; i++) recordApiRequest(ev({ statusCode: 400 }));
      expect(unattributedDroppedCount()).toBe(8);
      await flushApiUsage(prisma);
      expect(rowsOf(createMany)).toHaveLength(102);
      const { values } = stmtOf(executeRaw.mock.calls[0]!);
      expect(values.slice(0, PARAMS_PER_GROUP)).toContain(100); // all 100 attributed requests in the rollup
    });

    it("dropped unattributed events were in no rollup (nothing metered is lost)", async () => {
      process.env["API_UNATTRIBUTED_RAW_PER_MIN"] = "1";
      const { prisma, executeRaw } = fakePrisma();
      for (let i = 0; i < 5; i++) recordApiRequest(unattr());
      await flushApiUsage(prisma);
      expect(executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("raw-row cap for auth failures (rollups always count every request)", () => {
    it("writes at most 30 raw 401 rows per credential per minute but counts all of them in the rollup", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      const { prisma, createMany, executeRaw } = fakePrisma();
      for (let i = 0; i < 40; i++) recordApiRequest(ev({ statusCode: 401 }));
      for (let i = 0; i < 5; i++) recordApiRequest(ev({ statusCode: 401, apiKeyId: "key-2" })); // own budget
      for (let i = 0; i < 40; i++) recordApiRequest(ev({ statusCode: 401, organizationId: null, apiKeyId: null })); // unattributed: not capped here
      for (let i = 0; i < 40; i++) recordApiRequest(ev({ statusCode: 400 })); // other errors are never capped
      await flushApiUsage(prisma);
      const rows = rowsOf(createMany);
      expect(rows.filter((r) => r["apiKeyId"] === "key-1" && r["statusCode"] === 401)).toHaveLength(30);
      expect(rows.filter((r) => r["apiKeyId"] === "key-2")).toHaveLength(5);
      expect(rows.filter((r) => r["apiKeyId"] === null)).toHaveLength(40);
      expect(rows.filter((r) => r["statusCode"] === 400)).toHaveLength(40);
      const { values } = stmtOf(executeRaw.mock.calls[0]!);
      // group key-1/message.send: requests = 80 (40 x 401 + 40 x 400), auth_failures = 40 -> counters are NOT capped
      expect(values.slice(0, PARAMS_PER_GROUP)).toContain(80);
      expect(values.slice(0, PARAMS_PER_GROUP)[9]).toBe(40);
    });
    it("the budget refreshes in the next minute", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T10:00:10Z"), toFake: ["Date"] });
      const { prisma, createMany } = fakePrisma();
      for (let i = 0; i < 31; i++) recordApiRequest(ev({ statusCode: 401 }));
      vi.setSystemTime(new Date("2026-10-06T10:01:01Z"));
      for (let i = 0; i < 31; i++) recordApiRequest(ev({ statusCode: 401 }));
      await flushApiUsage(prisma);
      expect(rowsOf(createMany)).toHaveLength(60);
    });
  });
});

describe("drainUsageOnShutdown", () => {
  it("flushes immediately, again after the workers close, and resolves", async () => {
    const order: string[] = [];
    let closed = false;
    await drainUsageOnShutdown(
      async () => { order.push("close-start"); await new Promise((r) => setTimeout(r, 20)); closed = true; order.push("close-end"); },
      async () => { order.push(closed ? "flush-after" : "flush-early"); },
    );
    expect(order).toEqual(["flush-early", "close-start", "close-end", "flush-after"]);
  });

  it("is capped: resolves after the cap even when the workers never close, and the early flush has already run", async () => {
    const flush = vi.fn(async () => undefined);
    const t0 = Date.now();
    await drainUsageOnShutdown(() => new Promise(() => undefined), flush, 50);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("never rejects when close or flush throw", async () => {
    await expect(drainUsageOnShutdown(async () => { throw new Error("x"); }, async () => { throw new Error("y"); })).resolves.toBeUndefined();
  });
});
