import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const h = vi.hoisted(() => ({ summary: vi.fn(), list: vi.fn() }));
vi.mock("../lib/public-api/usage-queries.js", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, getUsageSummary: (...a: unknown[]) => h.summary(...a), listRequests: (...a: unknown[]) => h.list(...a) };
});

const mockPrisma = {
  vendorSetting: { findFirst: vi.fn() },
  apiRequestPayload: { findMany: vi.fn(), findFirst: vi.fn() },
  apiCallbackAttempt: { findMany: vi.fn() },
};

async function buildApp(role = "admin", permissions: Record<string, string> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId: "org-1", role: role as "admin", permissions, teamId: null, teamRole: null };
  });
  const { apiUsageRouter } = await import("./api-usage.js");
  await app.register(apiUsageRouter, { prefix: "/v1" });
  return app;
}

const ORIG_FLAG = process.env["PUBLIC_API_ENABLED"];
const emptySummary = { range: {}, totals: {}, series: [], byEndpoint: [], byCredential: [], messagesByStatus: {}, topFailureReasons: [] };

describe("api-usage routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    process.env["PUBLIC_API_ENABLED"] = "true";
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    mockPrisma.apiRequestPayload.findMany.mockResolvedValue([]);
    mockPrisma.apiRequestPayload.findFirst.mockResolvedValue(null);
    mockPrisma.apiCallbackAttempt.findMany.mockResolvedValue([]);
    h.summary.mockResolvedValue(emptySummary);
    h.list.mockResolvedValue({ data: [], nextCursor: null });
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close(); delete process.env["PUBLIC_API_ALLOWED_ORGS"];
    if (ORIG_FLAG === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = ORIG_FLAG;
  });

  const summary = (qs = "") => app.inject({ method: "GET", url: `/v1/api-usage/summary${qs}` });
  const requests = (qs = "") => app.inject({ method: "GET", url: `/v1/api-usage/requests${qs}` });

  describe("gating", () => {
    it("403 FORBIDDEN without settings_api_key permission, before any access lookup or query", async () => {
      await app.close();
      app = await buildApp("agent", { settings_access: "none" });
      for (const res of [await summary(), await requests()]) {
        expect(res.statusCode).toBe(403);
        expect(res.json()).toEqual({ error: { code: "FORBIDDEN", message: "settings_api_key permission required" } });
      }
      expect(mockPrisma.vendorSetting.findFirst).not.toHaveBeenCalled();
      expect(h.summary).not.toHaveBeenCalled();
    });

    it("identical 403 API_NOT_AVAILABLE for blocked, not allow-listed and flag-off orgs", async () => {
      const bodies: unknown[] = [];
      mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" }); // blocked
      bodies.push((await summary()).json());
      mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
      process.env["PUBLIC_API_ALLOWED_ORGS"] = "org-9"; // not allow-listed
      const notListed = await requests();
      bodies.push(notListed.json());
      delete process.env["PUBLIC_API_ALLOWED_ORGS"];
      process.env["PUBLIC_API_ENABLED"] = "false";
      const off = await summary();
      bodies.push(off.json());
      expect(notListed.statusCode).toBe(403);
      expect(off.statusCode).toBe(403);
      for (const b of bodies) expect(b).toEqual({ error: { code: "API_NOT_AVAILABLE", message: "API access is not available for this organization." } });
      expect(h.summary).not.toHaveBeenCalled();
      expect(h.list).not.toHaveBeenCalled();
    });
  });

  describe("GET /api-usage/summary", () => {
    it("defaults to 7d, passes the session org (never a client-supplied one) and returns the service result", async () => {
      const res = await app.inject({ method: "GET", url: "/v1/api-usage/summary?organizationId=org-2" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(emptySummary);
      const [, org, opts] = h.summary.mock.calls[0]!;
      expect(org).toBe("org-1");
      // whole UTC days: `to` is tomorrow 00:00Z (exclusive), `from` is exactly 7 days earlier
      expect(opts.to.toISOString()).toMatch(/T00:00:00\.000Z$/);
      expect(opts.to.getTime() - opts.from.getTime()).toBe(7 * 86_400_000);
      expect(opts.to.getTime()).toBeGreaterThan(Date.now());
      expect(opts.apiKeyId).toBeUndefined();
    });

    it("24h is a rolling window; 7d / 30d are WHOLE UTC days (today + the previous 6 / 29 days)", async () => {
      vi.useFakeTimers({ now: new Date("2026-10-06T15:42:10Z"), toFake: ["Date"] });
      try {
        await summary("?range=24h");
        let o = h.summary.mock.calls[0]![2];
        expect(o.from.toISOString()).toBe("2026-10-05T15:42:10.000Z");
        expect(o.to.toISOString()).toBe("2026-10-06T15:42:10.000Z");
        await summary("?range=7d");
        o = h.summary.mock.calls[1]![2];
        expect(o.from.toISOString()).toBe("2026-09-30T00:00:00.000Z");
        expect(o.to.toISOString()).toBe("2026-10-07T00:00:00.000Z"); // end of today UTC, exclusive
        await summary("?range=30d&apiKeyId=key-1");
        o = h.summary.mock.calls[2]![2];
        expect(o.from.toISOString()).toBe("2026-09-07T00:00:00.000Z");
        expect(o.to.toISOString()).toBe("2026-10-07T00:00:00.000Z");
        expect(o.apiKeyId).toBe("key-1");
      } finally { vi.useRealTimers(); }
    });

    it("day presets are the same whole-day window at ANY instant, including exactly 00:00:00.000Z and 23:59:59.999Z", async () => {
      for (const now of ["2026-10-06T00:00:00.000Z", "2026-10-06T23:59:59.999Z"]) {
        vi.useFakeTimers({ now: new Date(now), toFake: ["Date"] });
        try {
          h.summary.mockClear();
          await summary("?range=7d");
          const o = h.summary.mock.calls[0]![2];
          expect(o.from.toISOString(), now).toBe("2026-09-30T00:00:00.000Z");
          expect(o.to.toISOString(), now).toBe("2026-10-07T00:00:00.000Z");
        } finally { vi.useRealTimers(); }
      }
    });

    it("custom range: dates inclusive of the end day, from < to, max 366 days", async () => {
      const ok = await summary("?range=custom&from=2026-09-01&to=2026-09-30");
      expect(ok.statusCode).toBe(200);
      const o = h.summary.mock.calls[0]![2];
      expect(o.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
      expect(o.to.toISOString()).toBe("2026-10-01T00:00:00.000Z"); // exclusive end = inclusive 09-30
      expect((await summary("?range=custom&from=2025-10-05&to=2026-10-05")).statusCode).toBe(200); // 365 days + inclusive day
      for (const qs of [
        "?range=custom", "?range=custom&from=2026-09-01", "?range=custom&from=nope&to=2026-09-30",
        "?range=custom&from=2026-09-30&to=2026-09-01", "?range=custom&from=2026-09-01&to=2026-09-01T00:00:00Z",
        "?range=custom&from=2024-01-01&to=2026-09-30",
      ]) {
        const res = await summary(qs);
        expect(res.statusCode, qs).toBe(400);
        expect(res.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
      }
    });

    it("accepts ISO datetimes with Z or an explicit offset and uses them verbatim (to is exclusive)", async () => {
      const ok = await summary("?range=custom&from=2026-09-01T10:00:00Z&to=" + encodeURIComponent("2026-09-05T10:00:00+05:30"));
      expect(ok.statusCode).toBe(200);
      const o = h.summary.mock.calls[0]![2];
      expect(o.from.toISOString()).toBe("2026-09-01T10:00:00.000Z");
      expect(o.to.toISOString()).toBe("2026-09-05T04:30:00.000Z");
    });

    it("rejects impossible datetimes instead of letting them roll over", async () => {
      for (const bad of [
        "2026-02-31T10:00:00Z", "2026-04-31T10:00:00Z", "2025-02-29T10:00:00Z", "2026-09-01T24:00:00Z", "2026-09-01T24:00:00+05:30",
        "2026-09-01T10:60:00Z", "2026-09-01T10:00:60Z", "2026-09-01T23:59:60Z", "2026-00-10T10:00:00Z", "2026-09-00T10:00:00Z",
        "2026-09-31T10:00:00+05:30",
      ]) {
        const res = await summary("?range=custom&from=" + encodeURIComponent(bad) + "&to=2026-09-30");
        expect(res.statusCode, bad).toBe(400);
        expect(res.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
        expect((await summary("?range=custom&from=2026-08-01&to=" + encodeURIComponent(bad))).statusCode, "to " + bad).toBe(400);
      }
      expect(h.summary).not.toHaveBeenCalled();
      // valid edge values still pass (leap day, last second, offset)
      for (const good of ["2028-02-29T10:00:00Z", "2028-02-29T23:59:59Z", "2028-03-01T00:00:00.123+05:30", "2028-02-29T23:59:59-08:00"]) {
        expect((await summary("?range=custom&from=2028-02-01&to=" + encodeURIComponent(good))).statusCode, good).toBe(200);
      }
    });

    it("rejects bounds that are not YYYY-MM-DD or an ISO datetime with Z/offset (no server-local parsing)", async () => {
      for (const bad of [
        "2026-09-01T10:00:00", "2026-09-01T10:00", "2026-09-01 10:00:00", "Sep 1 2026", "09/01/2026", "1788000000000",
        "2026-9-1", "2026-02-31", "2026-13-01", "2026-09-01T25:00:00Z", "2026-09-01T10:00:00Zjunk", "2026-09-01T10:00:00+5",
      ]) {
        const res = await summary("?range=custom&from=" + encodeURIComponent(bad) + "&to=2026-09-30");
        expect(res.statusCode, bad).toBe(400);
        expect(res.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
        const res2 = await summary("?range=custom&from=2026-08-01&to=" + encodeURIComponent(bad));
        expect(res2.statusCode, "to " + bad).toBe(400);
      }
      expect(h.summary).not.toHaveBeenCalled();
    });

    it("400 INVALID_QUERY for unknown range and malformed apiKeyId", async () => {
      for (const qs of ["?range=1y", "?range=", "?apiKeyId=a%20b", `?apiKeyId=${"a".repeat(80)}`]) {
        expect((await summary(qs)).statusCode, qs).toBe(400);
      }
      expect(h.summary).not.toHaveBeenCalled();
    });

    it("repeated query params do not 500 (first value wins)", async () => {
      const res = await summary("?range=24h&range=7d&apiKeyId=k1&apiKeyId=k2");
      expect(res.statusCode).toBe(200);
      expect(h.summary.mock.calls[0]![2].apiKeyId).toBe("k1");
    });

    it("404 NOT_FOUND when the credential is not in the org (service returns null)", async () => {
      h.summary.mockResolvedValue(null);
      const res = await summary("?apiKeyId=foreign");
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    });
  });

  describe("GET /api-usage/requests", () => {
    it("defaults limit 50 and is org-scoped", async () => {
      expect((await requests()).statusCode).toBe(200);
      expect(h.list).toHaveBeenCalledWith(expect.anything(), "org-1", expect.objectContaining({ limit: 50 }));
    });

    it("passes filters through; outcome=error is accepted", async () => {
      await requests("?limit=100&outcome=error&apiKeyId=key-1&endpoint=message.send&cursor=abc");
      expect(h.list.mock.calls[0]![2]).toEqual({ limit: 100, outcome: "error", apiKeyId: "key-1", endpoint: "message.send", cursor: "abc" });
    });

    it("400 INVALID_QUERY for out-of-range limit, unknown outcome/endpoint, oversized cursor", async () => {
      for (const qs of ["?limit=0", "?limit=101", "?limit=x", "?limit=1.5", "?outcome=bad", "?endpoint=nope", `?cursor=${"a".repeat(300)}`]) {
        const res = await requests(qs);
        expect(res.statusCode, qs).toBe(400);
        expect(res.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
      }
      expect(h.list).not.toHaveBeenCalled();
    });

    it("400 for a cursor the service rejects, 404 for a foreign credential", async () => {
      h.list.mockResolvedValueOnce("invalid_cursor");
      expect((await requests("?cursor=abc")).statusCode).toBe(400);
      h.list.mockResolvedValueOnce(null);
      expect((await requests("?apiKeyId=foreign")).statusCode).toBe(404);
    });

    describe("date range", () => {
      const win = () => h.list.mock.calls[0]![2] as { from?: Date; to?: Date };

      it("no range params -> no window (all retained rows)", async () => {
        await requests();
        expect(win().from).toBeUndefined();
        expect(win().to).toBeUndefined();
      });

      it("from/to: a date-only to is inclusive of that day; datetimes with an offset are honoured", async () => {
        await requests("?from=2026-09-01&to=2026-09-30");
        expect(win().from!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
        expect(win().to!.toISOString()).toBe("2026-10-01T00:00:00.000Z");
        h.list.mockClear();
        await requests("?from=2026-09-01T10:00:00%2B02:00&to=2026-09-02T00:00:00Z");
        expect(win().from!.toISOString()).toBe("2026-09-01T08:00:00.000Z");
        expect(win().to!.toISOString()).toBe("2026-09-02T00:00:00.000Z");
      });

      it("400 INVALID_QUERY for bad dates, from >= to, spans over 366 days, unknown/custom range, range mixed with from/to", async () => {
        for (const qs of [
          "?from=nope", "?to=2026-02-31", "?from=2026-09-01T10:00:00", "?from=2026-09-02&to=2026-09-01", "?from=2026-09-01T00:00:00Z&to=2026-09-01T00:00:00Z",
          "?from=2024-01-01&to=2026-01-01", "?range=1y", "?range=custom", "?range=7d&from=2026-09-01",
        ]) {
          const res = await requests(qs);
          expect(res.statusCode, qs).toBe(400);
          expect(res.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
        }
        expect(h.list).not.toHaveBeenCalled();
      });

      it("range presets resolve to EXACTLY the window /summary uses", async () => {
        vi.useFakeTimers({ now: new Date("2026-10-06T15:42:10.123Z"), toFake: ["Date"] });
        try {
          for (const range of ["24h", "7d", "30d"]) {
            h.list.mockClear(); h.summary.mockClear();
            await requests(`?range=${range}`);
            await summary(`?range=${range}`);
            const s = h.summary.mock.calls[0]![2] as { from: Date; to: Date };
            expect(win().from!.getTime(), range).toBe(s.from.getTime());
            expect(win().to!.getTime(), range).toBe(s.to.getTime());
          }
          h.list.mockClear();
          await requests("?range=7d");
          expect(win().from!.toISOString()).toBe("2026-09-30T00:00:00.000Z");
          expect(win().to!.toISOString()).toBe("2026-10-07T00:00:00.000Z");
        } finally {
          vi.useRealTimers();
        }
      });

      it("repeated range / from / to params use the first value and do not 500", async () => {
        expect((await requests("?range=7d&range=30d")).statusCode).toBe(200);
        expect(win().to!.getTime() - win().from!.getTime()).toBe(7 * 86_400_000);
        h.list.mockClear();
        expect((await requests("?from=2026-09-01&from=2020-01-01&to=2026-09-02&to=2027-01-01")).statusCode).toBe(200);
        expect(win().from!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
      });
    });

    it("repeated params do not 500", async () => {
      expect((await requests("?limit=5&limit=7&outcome=success&outcome=error")).statusCode).toBe(200);
      expect(h.list.mock.calls[0]![2]).toMatchObject({ limit: 5, outcome: "success" });
    });
  });

  describe("payload and callback history", () => {
    const UUID_A = "11111111-1111-4111-8111-111111111111";
    const UUID_B = "22222222-2222-4222-8222-222222222222";
    const getUrl = (u: string) => app.inject({ method: "GET", url: `/v1${u}` });
    const NEW_ROUTES = ["/api-usage/payloads", `/api-usage/payloads/${UUID_A}`, "/api-usage/callbacks"];
    const cursorOf = (iso: string, id: string) => Buffer.from(`${iso}|${id}`).toString("base64url");
    const ORIG_LOG = process.env["API_PAYLOAD_LOGGING_ENABLED"];
    afterEach(() => {
      if (ORIG_LOG === undefined) delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; else process.env["API_PAYLOAD_LOGGING_ENABLED"] = ORIG_LOG;
    });

    /** organizationId must be a top-level key of where; any OR is a sibling AND-ed with it, never a replacement for it. */
    const assertOrgAnded = (where: Record<string, unknown>) => {
      expect(where["organizationId"]).toBe("org-1");
      expect(Object.keys(where)).not.toContain("AND");
      for (const clause of (where["OR"] as Record<string, unknown>[] | undefined) ?? []) expect(clause).not.toHaveProperty("organizationId");
    };

    it("403 FORBIDDEN on all three new routes without settings_api_key, and no query runs", async () => {
      await app.close();
      app = await buildApp("agent", { settings_access: "none" });
      for (const u of NEW_ROUTES) {
        const res = await getUrl(u);
        expect(res.statusCode, u).toBe(403);
        expect(res.json()).toEqual({ error: { code: "FORBIDDEN", message: "settings_api_key permission required" } });
      }
      expect(mockPrisma.apiRequestPayload.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.apiRequestPayload.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.apiCallbackAttempt.findMany).not.toHaveBeenCalled();
    });

    it("403 API_NOT_AVAILABLE on all three new routes for a blocked org, and no query runs", async () => {
      mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "1" });
      for (const u of NEW_ROUTES) {
        const res = await getUrl(u);
        expect(res.statusCode, u).toBe(403);
        expect(res.json()).toEqual({ error: { code: "API_NOT_AVAILABLE", message: "API access is not available for this organization." } });
      }
      expect(mockPrisma.apiRequestPayload.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.apiRequestPayload.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.apiCallbackAttempt.findMany).not.toHaveBeenCalled();
    });

    it("payload detail: scoped findFirst({ id, organizationId }); 200 with bodies for the caller's own row", async () => {
      const row = { id: UUID_A, organizationId: "org-1", requestBody: '{"a":1}', responseBody: "{}", createdAt: new Date("2026-10-09T00:00:00Z") };
      mockPrisma.apiRequestPayload.findFirst.mockResolvedValue(row);
      const ok = await getUrl(`/api-usage/payloads/${UUID_A}`);
      expect(ok.statusCode).toBe(200);
      expect(ok.json().requestBody).toBe('{"a":1}');
      expect(mockPrisma.apiRequestPayload.findFirst.mock.calls[0]![0].where).toEqual({ id: UUID_A, organizationId: "org-1" });
    });

    it("payload detail: another org's id returns a 404 identical to a nonexistent id", async () => {
      mockPrisma.apiRequestPayload.findFirst.mockResolvedValue(null); // the scoped query finds nothing for a foreign row
      const foreign = await getUrl(`/api-usage/payloads/${UUID_A}`);
      const missing = await getUrl(`/api-usage/payloads/${UUID_B}`);
      expect(foreign.statusCode).toBe(404);
      expect(missing.statusCode).toBe(404);
      expect(foreign.json()).toEqual(missing.json());
      expect(foreign.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
      for (const c of mockPrisma.apiRequestPayload.findFirst.mock.calls) expect(c[0].where.organizationId).toBe("org-1");
    });

    it("payload list: org-scoped, newest first, take limit+1, summary columns only, enabled flag from env", async () => {
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
      const res = await getUrl("/api-usage/payloads?limit=2");
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ enabled: true, data: [], nextCursor: null });
      const arg = mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0];
      expect(arg.where).toEqual({ organizationId: "org-1" });
      expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
      expect(arg.take).toBe(3);
      expect(arg.select).toEqual({ id: true, createdAt: true, method: true, endpoint: true, statusCode: true, outcome: true, errorClass: true, errorCode: true, durationMs: true, apiKeyId: true });
      process.env["API_PAYLOAD_LOGGING_ENABLED"] = "false";
      expect((await getUrl("/api-usage/payloads")).json().enabled).toBe(false);
      delete process.env["API_PAYLOAD_LOGGING_ENABLED"];
      expect((await getUrl("/api-usage/payloads")).json().enabled).toBe(false);
    });

    it("payload list: default limit 50 (take 51); nextCursor is built from the last page row only when more exist", async () => {
      await getUrl("/api-usage/payloads");
      expect(mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].take).toBe(51);
      const mk = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });
      mockPrisma.apiRequestPayload.findMany.mockResolvedValue([mk(UUID_B, "2026-10-09T10:00:00.000Z"), mk(UUID_A, "2026-10-09T09:00:00.000Z"), mk("33333333-3333-4333-8333-333333333333", "2026-10-09T08:00:00.000Z")]);
      const body = (await getUrl("/api-usage/payloads?limit=2")).json();
      expect(body.data).toHaveLength(2);
      expect(body.nextCursor).toBe(cursorOf("2026-10-09T09:00:00.000Z", UUID_A));
      mockPrisma.apiRequestPayload.findMany.mockResolvedValue([mk(UUID_B, "2026-10-09T10:00:00.000Z")]);
      expect((await getUrl("/api-usage/payloads?limit=2")).json().nextCursor).toBeNull();
    });

    it("payload list: filters and the cursor clause are AND-ed with a top-level organizationId", async () => {
      const at = "2026-10-09T09:00:00.000Z";
      const res = await getUrl(`/api-usage/payloads?outcome=error&endpoint=message.send&apiKeyId=key-1&cursor=${cursorOf(at, UUID_A)}`);
      expect(res.statusCode).toBe(200);
      const where = mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].where;
      assertOrgAnded(where);
      expect(where).toEqual({
        organizationId: "org-1",
        outcome: { in: ["client_error", "server_error"] },
        endpoint: "message.send",
        apiKeyId: "key-1",
        OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: UUID_A } }],
      });
      mockPrisma.apiRequestPayload.findMany.mockClear();
      await getUrl("/api-usage/payloads?outcome=success");
      expect(mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", outcome: "success" });
    });

    it("a client-supplied organizationId param never reaches the where; a foreign apiKeyId stays under the caller's org", async () => {
      await getUrl("/api-usage/payloads?organizationId=org-2&apiKeyId=foreign-key");
      await getUrl(`/api-usage/callbacks?organizationId=org-2&messageId=${UUID_A}`);
      expect(mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", apiKeyId: "foreign-key" });
      expect(mockPrisma.apiCallbackAttempt.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", messageId: UUID_A });
    });

    it("callbacks list: org-scoped, filterable by messageId, paginated with the same cursor scheme", async () => {
      const at = "2026-10-09T09:00:00.000Z";
      const res = await getUrl(`/api-usage/callbacks?messageId=${UUID_A}&limit=1&cursor=${cursorOf(at, UUID_B)}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [], nextCursor: null });
      const arg = mockPrisma.apiCallbackAttempt.findMany.mock.calls[0]![0];
      assertOrgAnded(arg.where);
      expect(arg.where).toEqual({
        organizationId: "org-1",
        messageId: UUID_A,
        OR: [{ createdAt: { lt: new Date(at) } }, { createdAt: new Date(at), id: { lt: UUID_B } }],
      });
      expect(arg.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
      expect(arg.take).toBe(2);
      expect(arg.select).toEqual({ id: true, createdAt: true, messageId: true, url: true, method: true, attempt: true, outcome: true, httpStatus: true, reason: true, durationMs: true, fields: true });
      mockPrisma.apiCallbackAttempt.findMany.mockResolvedValue([
        { id: UUID_B, createdAt: new Date("2026-10-09T10:00:00.000Z") },
        { id: UUID_A, createdAt: new Date("2026-10-09T09:00:00.000Z") },
      ]);
      const page = (await getUrl("/api-usage/callbacks?limit=1")).json();
      expect(page.data).toHaveLength(1);
      expect(page.nextCursor).toBe(cursorOf("2026-10-09T10:00:00.000Z", UUID_B));
    });

    it("400 INVALID_QUERY for each bad input and no query runs", async () => {
      const badCursors = [
        "%%%", "abc", cursorOf("not-a-date", UUID_A), cursorOf("2026-10-09T09:00:00.000Z", "not-a-uuid"),
        cursorOf("2026-10-09T09:00:00.000Z", ""), "a".repeat(300),
        cursorOf("+275760-09-13T00:00:00.000Z", UUID_A), cursorOf("-271821-04-20T00:00:00.000Z", UUID_A),
        cursorOf("1999-12-31T23:59:59.999Z", UUID_A), cursorOf("2101-01-01T00:00:00.000Z", UUID_A),
        cursorOf("2026-10-09T09:00:00Z", UUID_A), Buffer.from(`2026-10-09T09:00:00.000Z|${UUID_A}|extra`).toString("base64url"),
      ];
      const bad = [
        "/api-usage/payloads?limit=1e2", "/api-usage/payloads?limit=-1", "/api-usage/callbacks?limit=1e2", "/api-usage/callbacks?limit=-1",
        "/api-usage/payloads?limit=0", "/api-usage/payloads?limit=101", "/api-usage/payloads?limit=x", "/api-usage/payloads?limit=1.5",
        "/api-usage/payloads?outcome=bad", "/api-usage/payloads?endpoint=nope",
        "/api-usage/payloads?apiKeyId=a%20b", `/api-usage/payloads?apiKeyId=${"a".repeat(80)}`,
        ...badCursors.map((c) => `/api-usage/payloads?cursor=${c}`),
        ...badCursors.map((c) => `/api-usage/callbacks?cursor=${c}`),
        "/api-usage/callbacks?limit=0", "/api-usage/callbacks?limit=101",
        "/api-usage/callbacks?messageId=not-a-uuid", `/api-usage/callbacks?messageId=${UUID_A}x`,
        "/api-usage/payloads/not%20valid", "/api-usage/payloads/abc", `/api-usage/payloads/${UUID_A}x`,
      ];
      for (const u of bad) {
        const res = await getUrl(u);
        expect(res.statusCode, u).toBe(400);
        expect(res.json(), u).toMatchObject({ error: { code: "INVALID_QUERY" } });
      }
      expect(mockPrisma.apiRequestPayload.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.apiRequestPayload.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.apiCallbackAttempt.findMany).not.toHaveBeenCalled();
    });

    it("limit=010 is accepted as 10 (take 11)", async () => {
      expect((await getUrl("/api-usage/payloads?limit=010")).statusCode).toBe(200);
      expect(mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].take).toBe(11);
    });

    it("repeated params do not 500 (first value wins)", async () => {
      expect((await getUrl("/api-usage/payloads?limit=5&limit=7&outcome=success&outcome=error")).statusCode).toBe(200);
      expect(mockPrisma.apiRequestPayload.findMany.mock.calls[0]![0].take).toBe(6);
    });
  });

  it("only GET is routed (no write surface)", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"] as const) {
      expect((await app.inject({ method, url: "/v1/api-usage/summary" })).statusCode).toBe(404);
    }
  });
});
