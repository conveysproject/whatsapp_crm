import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const stFindFirst = vi.fn();
const orgFindUnique = vi.fn();
const settingFindUnique = vi.fn();
const mockPrisma = { billingStatement: { findFirst: stFindFirst }, organization: { findUnique: orgFindUnique }, billingSetting: { findUnique: settingFindUnique } };

async function buildAs(role: string, permissions: Record<string, string> = {}, organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { billingStatementPdfRouter } = await import("./billing-statement-pdf.js");
  await app.register(billingStatementPdfRouter, { prefix: "/v1" });
  return app;
}

const statement = {
  id: "st-123456", month: "2026-10-14", messages: 3240, bandName: "Band 1", amountInr: 500, amountUsd: 5, status: "issued",
  currency: "INR", amountMinor: 59000, taxMinor: 9000, dueAt: new Date("2026-11-21T00:00:00Z"), issuedAt: new Date("2026-11-14T00:00:00Z"),
};

describe("GET /v1/billing/statements/:cycle/pdf", () => {
  beforeEach(() => {
    stFindFirst.mockReset().mockResolvedValue(statement);
    orgFindUnique.mockReset().mockResolvedValue({ name: "Acme", createdAt: new Date("2026-03-14T09:00:00Z"), settings: {} });
    settingFindUnique.mockReset().mockResolvedValue(null);
  });

  it("refuses roles without settings_billing before any query", async () => {
    const app = await buildAs("agent");
    expect((await app.inject({ method: "GET", url: "/v1/billing/statements/2026-10-14/pdf" })).statusCode).toBe(403);
    expect(stFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
  it("rejects a malformed cycle", async () => {
    const app = await buildAs("admin");
    for (const c of ["2026-10", "abc", "2026-02-30"]) {
      expect((await app.inject({ method: "GET", url: `/v1/billing/statements/${c}/pdf` })).statusCode, c).toBe(400);
    }
    expect(stFindFirst).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns a PDF for the callers own issued statement only", async () => {
    const app = await buildAs("admin", {}, "org-7");
    const res = await app.inject({ method: "GET", url: "/v1/billing/statements/2026-10-14/pdf" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("wbmsg-statement-2026-10-14.pdf");
    expect(res.rawPayload.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(stFindFirst.mock.calls[0]![0].where).toEqual({ organizationId: "org-7", month: "2026-10-14", status: { in: ["issued", "no_payment", "paid"] } });
    await app.close();
  });
  it("returns 404 for a draft, voided or other organizations statement", async () => {
    stFindFirst.mockResolvedValue(null);
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/statements/2026-10-14/pdf" })).statusCode).toBe(404);
    await app.close();
  });
  it("handles a free statement that has no currency or total yet", async () => {
    stFindFirst.mockResolvedValue({ ...statement, status: "no_payment", currency: null, amountMinor: null, taxMinor: null, amountInr: 0, amountUsd: 0 });
    const app = await buildAs("admin");
    expect((await app.inject({ method: "GET", url: "/v1/billing/statements/2026-10-14/pdf" })).statusCode).toBe(200);
    await app.close();
  });
});
