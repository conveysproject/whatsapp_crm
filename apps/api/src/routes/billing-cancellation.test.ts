import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as CancellationModule from "../lib/billing/cancellation.js";

const { requestCancellation, withdrawCancellation, approveCancellation, reopenAccount } = vi.hoisted(() => ({
  requestCancellation: vi.fn(), withdrawCancellation: vi.fn(), approveCancellation: vi.fn(), reopenAccount: vi.fn(),
}));
vi.mock("../lib/billing/cancellation.js", async (orig) => ({
  ...(await orig<typeof CancellationModule>()),
  requestCancellation, withdrawCancellation, approveCancellation, reopenAccount,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../lib/mail.js", () => ({ sendMail: vi.fn() }));

const cancelFindUnique = vi.fn();
const cancelFindMany = vi.fn();
const orgFindMany = vi.fn();
const mockPrisma = { billingCancellation: { findUnique: cancelFindUnique, findMany: cancelFindMany }, organization: { findMany: orgFindMany } };

async function build(role: string, router: "customer" | "admin", organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions: {}, teamId: null, teamRole: null };
  });
  if (router === "customer") {
    const { billingCancellationRouter } = await import("./billing-cancellation.js");
    await app.register(billingCancellationRouter, { prefix: "/v1" });
  } else {
    const { adminBillingCancellationsRouter } = await import("./admin-billing-cancellations.js");
    await app.register(adminBillingCancellationsRouter, { prefix: "/v1" });
  }
  return app;
}

describe("customer cancellation routes", () => {
  beforeEach(() => {
    [requestCancellation, withdrawCancellation, approveCancellation, reopenAccount, cancelFindUnique, cancelFindMany, orgFindMany].forEach((m) => m.mockReset());
  });

  it("refuses roles without settings_billing before any work", async () => {
    const app = await build("agent", "customer");
    expect((await app.inject({ method: "GET", url: "/v1/billing/cancellation" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation", payload: { confirm: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation/withdraw" })).statusCode).toBe(403);
    expect(requestCancellation).not.toHaveBeenCalled();
    await app.close();
  });
  it("shows null when nothing was requested and the state when it was, for the callers own organization", async () => {
    cancelFindUnique.mockResolvedValue(null);
    const app = await build("admin", "customer", "org-7");
    expect((await app.inject({ method: "GET", url: "/v1/billing/cancellation" })).json<{ data: unknown }>().data).toBeNull();
    expect(cancelFindUnique.mock.calls[0]![0].where).toEqual({ organizationId: "org-7" });
    cancelFindUnique.mockResolvedValue({ status: "approved", requestedAt: new Date("2026-11-01T00:00:00Z"), approvedAt: new Date("2026-11-02T00:00:00Z") });
    const d = (await app.inject({ method: "GET", url: "/v1/billing/cancellation" })).json<{ data: { status: string; deleteAfter: string } }>().data;
    expect(d.status).toBe("approved");
    expect(d.deleteAfter).toBe("2026-12-02T00:00:00.000Z");
    await app.close();
  });
  it("requires an explicit confirmation and valid text before it asks to cancel", async () => {
    const app = await build("admin", "customer");
    for (const body of [{}, { confirm: false }, { confirm: "yes" }, { confirm: true, reason: 5 }]) {
      expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation", payload: body })).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(requestCancellation).not.toHaveBeenCalled();
    await app.close();
  });
  it("creates a request for the callers own organization only, and refuses a duplicate", async () => {
    requestCancellation.mockResolvedValue("created");
    const app = await build("admin", "customer", "org-7");
    const res = await app.inject({ method: "POST", url: "/v1/billing/cancellation", payload: { confirm: true, reason: "too expensive", organizationId: "someone-else" } });
    expect(res.statusCode).toBe(201);
    expect(requestCancellation).toHaveBeenCalledWith(mockPrisma, { organizationId: "org-7", userId: "u-1", reason: "too expensive" });
    requestCancellation.mockResolvedValue("exists");
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation", payload: { confirm: true } })).statusCode).toBe(409);
    await app.close();
  });
  it("withdraws an open request and refuses when there is none", async () => {
    withdrawCancellation.mockResolvedValue(true);
    const app = await build("admin", "customer", "org-7");
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation/withdraw" })).statusCode).toBe(200);
    expect(withdrawCancellation).toHaveBeenCalledWith(mockPrisma, "org-7");
    withdrawCancellation.mockResolvedValue(false);
    expect((await app.inject({ method: "POST", url: "/v1/billing/cancellation/withdraw" })).statusCode).toBe(409);
    await app.close();
  });
});

describe("admin cancellation routes", () => {
  beforeEach(() => {
    [requestCancellation, withdrawCancellation, approveCancellation, reopenAccount, cancelFindUnique, cancelFindMany, orgFindMany].forEach((m) => m.mockReset());
  });

  it("is super-admin only", async () => {
    const app = await build("admin", "admin");
    expect((await app.inject({ method: "GET", url: "/v1/admin/billing/cancellations" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/approve" })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/reopen" })).statusCode).toBe(403);
    expect(approveCancellation).not.toHaveBeenCalled();
    expect(reopenAccount).not.toHaveBeenCalled();
    await app.close();
  });
  it("lists open and approved cancellations with the organization name and delete date", async () => {
    cancelFindMany.mockResolvedValue([{ organizationId: "o1", status: "approved", requestedAt: new Date("2026-11-01T00:00:00Z"), approvedAt: new Date("2026-11-02T00:00:00Z"), reason: "moving" }]);
    orgFindMany.mockResolvedValue([{ id: "o1", name: "Acme" }]);
    const app = await build("superAdmin", "admin");
    const rows = (await app.inject({ method: "GET", url: "/v1/admin/billing/cancellations" })).json<{ data: Array<{ name: string; reason: string; status: string; deleteAfter: string }> }>().data;
    expect(rows[0]).toMatchObject({ name: "Acme", reason: "moving", status: "approved", deleteAfter: "2026-12-02T00:00:00.000Z" });
    expect(cancelFindMany.mock.calls[0]![0].where).toEqual({ status: { in: ["requested", "approved"] } });
    await app.close();
  });
  it("approves with the approvers id, and refuses when there is no open request", async () => {
    approveCancellation.mockResolvedValue({ approved: true, statement: { created: true, status: "issued" } });
    const app = await build("superAdmin", "admin");
    const res = await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/approve" });
    expect(res.statusCode).toBe(200);
    expect(approveCancellation).toHaveBeenCalledWith(mockPrisma, "o1", "u-1");
    approveCancellation.mockResolvedValue({ approved: false });
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/approve" })).statusCode).toBe(409);
    await app.close();
  });
  it("reopens an account, and refuses when there is nothing to reopen", async () => {
    reopenAccount.mockResolvedValue(true);
    const app = await build("superAdmin", "admin");
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/reopen" })).statusCode).toBe(200);
    reopenAccount.mockResolvedValue(false);
    expect((await app.inject({ method: "POST", url: "/v1/admin/billing/cancellations/o1/reopen" })).statusCode).toBe(409);
    await app.close();
  });
});
