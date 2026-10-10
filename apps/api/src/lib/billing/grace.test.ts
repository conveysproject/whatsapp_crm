import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { expireGraceOrgs } from "./grace.js";

const prisma = { organization: { findMany: vi.fn(), updateMany: vi.fn() } } as unknown as PrismaClient;
const findMany = prisma.organization.findMany as ReturnType<typeof vi.fn>;
const updateMany = prisma.organization.updateMany as ReturnType<typeof vi.fn>;
const now = new Date("2026-10-20T00:00:00Z");

describe("expireGraceOrgs", () => {
  beforeEach(() => { findMany.mockReset(); updateMany.mockReset(); });

  it("selects only past_due orgs whose grace has ended", async () => {
    findMany.mockResolvedValue([]);
    await expireGraceOrgs(prisma, now);
    expect(findMany).toHaveBeenCalledWith({ where: { billingStatus: "past_due", billingGraceEndsAt: { lt: now } }, select: { id: true }, take: 500 });
  });

  it("downgrades each due org to starter and clears grace, guarded on still being past_due", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    updateMany.mockResolvedValue({ count: 1 });
    const ids = await expireGraceOrgs(prisma, now);
    expect(ids).toEqual(["a", "b"]);
    const data = { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false };
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "a", billingStatus: "past_due", billingGraceEndsAt: { lt: now } }, data });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "b", billingStatus: "past_due", billingGraceEndsAt: { lt: now } }, data });
  });

  it("one failing org does not abort the sweep", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    updateMany.mockRejectedValueOnce(new Error("db blip")).mockResolvedValueOnce({ count: 1 });
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await expireGraceOrgs(prisma, now)).toEqual(["b"]);
    expect(updateMany).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("does not report orgs that paid in the meantime (guard matched nothing)", async () => {
    findMany.mockResolvedValue([{ id: "a" }]);
    updateMany.mockResolvedValue({ count: 0 });
    expect(await expireGraceOrgs(prisma, now)).toEqual([]);
  });
});
