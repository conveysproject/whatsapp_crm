import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/prisma.js", () => ({ prisma: {} }));

const orgFindUnique = vi.fn();
const stFindMany = vi.fn();
const settingFindUnique = vi.fn();
const cancelFind = vi.fn();
const mockPrisma = { organization: { findUnique: orgFindUnique }, billingStatement: { findMany: stFindMany }, billingSetting: { findUnique: settingFindUnique }, billingCancellation: { findUnique: cancelFind } };

async function buildAs(role: string, organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions: {}, teamId: null, teamRole: null };
  });
  const { billingStandingRouter } = await import("./billing-standing.js");
  await app.register(billingStandingRouter, { prefix: "/v1" });
  return app;
}

const DAY = 86_400_000;
const cfg = (mode: string) => ({ value: { published: true, freeAllowance: 500, alertsEnabled: false, chargingStartDate: null, gstRatePercent: 0, autoIssueEnabled: false, blockingMode: mode, bands: [{ upTo: 10000, inr: 500, usd: 5 }] } });

describe("GET /v1/billing/standing", () => {
  beforeEach(async () => {
    vi.resetModules();
    [orgFindUnique, stFindMany, settingFindUnique, cancelFind].forEach((m) => m.mockReset());
    cancelFind.mockResolvedValue(null);
    orgFindUnique.mockResolvedValue({ name: "Acme", settings: {} });
    settingFindUnique.mockResolvedValue(cfg("enforce"));
    stFindMany.mockResolvedValue([]);
  });

  it("is available to any signed-in member, including an agent, and carries no amounts or links", async () => {
    stFindMany.mockResolvedValue([{ month: "2026-10-14", dueAt: new Date(Date.now() - 10 * DAY) }]);
    const app = await buildAs("agent");
    const res = await app.inject({ method: "GET", url: "/v1/billing/standing" });
    expect(res.statusCode).toBe(200);
    const d = res.json<{ data: Record<string, unknown> }>().data;
    expect(Object.keys(d).sort()).toEqual(["blockAt", "dueAt", "paused", "state"]);
    expect(d["state"]).toBe("blocked");
    expect(d["paused"]).toBe(true);
    await app.close();
  });
  it("reads only the callers own organization", async () => {
    const app = await buildAs("admin", "org-7");
    await app.inject({ method: "GET", url: "/v1/billing/standing" });
    expect(stFindMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-7" });
    await app.close();
  });
  it("reports overdue inside the grace period without pausing, and watch mode never reports paused", async () => {
    stFindMany.mockResolvedValue([{ month: "m", dueAt: new Date(Date.now() - 2 * DAY) }]);
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/standing" })).json<{ data: { state: string; paused: boolean } }>().data).toMatchObject({ state: "overdue", paused: false });
    await app.close();
    vi.resetModules();
    settingFindUnique.mockResolvedValue(cfg("watch"));
    stFindMany.mockResolvedValue([{ month: "m", dueAt: new Date(Date.now() - 30 * DAY) }]);
    const app2 = await buildAs("admin");
    expect((await app2.inject({ method: "GET", url: "/v1/billing/standing" })).json<{ data: { state: string; paused: boolean } }>().data).toMatchObject({ state: "blocked", paused: false });
    await app2.close();
  });
  it("reports a cancelled account as cancelled and paused, whatever the blocking mode", async () => {
    cancelFind.mockResolvedValue({ status: "approved" });
    settingFindUnique.mockResolvedValue(cfg("off"));
    const app = await buildAs("agent");
    expect((await app.inject({ method: "GET", url: "/v1/billing/standing" })).json<{ data: { state: string; paused: boolean } }>().data).toMatchObject({ state: "cancelled", paused: true });
    await app.close();
  });
  it("reports fine when blocking is off, and never fails the page when the lookup breaks", async () => {
    settingFindUnique.mockResolvedValue(cfg("off"));
    stFindMany.mockResolvedValue([{ month: "m", dueAt: new Date(Date.now() - 30 * DAY) }]);
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/standing" })).json<{ data: { state: string } }>().data.state).toBe("ok");
    await app.close();
    vi.resetModules();
    orgFindUnique.mockRejectedValue(new Error("db down"));
    settingFindUnique.mockResolvedValue(cfg("enforce"));
    const app2 = await buildAs("admin");
    const res = await app2.inject({ method: "GET", url: "/v1/billing/standing" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { state: string; paused: boolean } }>().data).toMatchObject({ state: "ok", paused: false });
    await app2.close();
  });
});
