import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const findUnique = vi.fn();
const update = vi.fn();
const mockPrisma = { organization: { findUnique, update } };

async function buildAs(role: string, permissions: Record<string, string> = {}, organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { billingDetailsRouter } = await import("./billing-details.js");
  await app.register(billingDetailsRouter, { prefix: "/v1" });
  return app;
}

const valid = { billingEmail: "accounts@acme.in", legalName: "Acme Retail Pvt Ltd", gstin: "27AAPFU0939F1ZV", address: "12 MG Road, Pune" };

describe("billing details", () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue({ settings: { theme: "dark" } });
    update.mockReset().mockResolvedValue({});
  });

  it("refuses roles without settings_billing before touching the database", async () => {
    const app = await buildAs("agent");
    expect((await app.inject({ method: "GET", url: "/v1/billing/details" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/v1/billing/details", payload: valid })).statusCode).toBe(403);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
  it("reads only the caller's own organization", async () => {
    findUnique.mockResolvedValue({ settings: { billing: valid } });
    const app = await buildAs("admin", {}, "org-7");
    const res = await app.inject({ method: "GET", url: "/v1/billing/details" });
    expect(res.json<{ data: unknown }>().data).toEqual(valid);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "org-7" }, select: { settings: true } });
    await app.close();
  });
  it("validates before writing and never writes another organization", async () => {
    const app = await buildAs("admin", {}, "org-7");
    expect((await app.inject({ method: "PUT", url: "/v1/billing/details", payload: { ...valid, gstin: "BAD" } })).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect((await app.inject({ method: "PUT", url: "/v1/billing/details", payload: { ...valid, organizationId: "someone-else" } })).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "org-7" }, data: { settings: { theme: "dark", billing: valid } } });
    await app.close();
  });
  it("returns 404 when the organization is gone", async () => {
    findUnique.mockResolvedValue(null);
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/details" })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/v1/billing/details", payload: valid })).statusCode).toBe(404);
    await app.close();
  });

  it("reads and saves alert preferences for the callers own organization only", async () => {
    findUnique.mockResolvedValue({ settings: { theme: "dark" } });
    const prefs = { step50: false, step80: true, step95: true, step100: true, newBand: true, email: true, inApp: false };
    const app = await buildAs("admin", {}, "org-7");
    expect((await app.inject({ method: "GET", url: "/v1/billing/alert-preferences" })).json<{ data: { step50: boolean } }>().data.step50).toBe(true);
    expect((await app.inject({ method: "PUT", url: "/v1/billing/alert-preferences", payload: { step50: "no" } })).statusCode).toBe(400);
    expect(update).not.toHaveBeenCalled();
    expect((await app.inject({ method: "PUT", url: "/v1/billing/alert-preferences", payload: { ...prefs, organizationId: "someone-else" } })).statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "org-7" }, data: { settings: { theme: "dark", billingAlerts: prefs } } });
    await app.close();
  });
  it("refuses alert preferences to roles without settings_billing", async () => {
    const app = await buildAs("agent");
    expect((await app.inject({ method: "GET", url: "/v1/billing/alert-preferences" })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: "/v1/billing/alert-preferences", payload: {} })).statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
    await app.close();
  });
});
