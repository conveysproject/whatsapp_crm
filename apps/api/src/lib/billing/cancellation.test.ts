import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail, ensurePaymentLinks, runMeteringSweep } = vi.hoisted(() => ({ sendMail: vi.fn(), ensurePaymentLinks: vi.fn(), runMeteringSweep: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail }));
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("./statement-payment.js", () => ({ ensurePaymentLinks }));
vi.mock("./metering-sweep.js", () => ({ runMeteringSweep }));

import { requestCancellation, withdrawCancellation, approveCancellation, reopenAccount, createFinalStatement, deletionDue, viewOf, RETENTION_DAYS } from "./cancellation.js";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");

function makePrisma() {
  const m = {
    cancel: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    org: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
    statement: { findFirst: vi.fn(), create: vi.fn() },
    usage: { findMany: vi.fn() },
  };
  const prisma = {
    billingCancellation: m.cancel, organization: m.org, user: m.user, billingSetting: m.setting,
    billingStatement: m.statement, messageUsageDaily: m.usage,
  } as unknown as PrismaClient;
  return { m, prisma };
}

describe("cancellation request", () => {
  let t: ReturnType<typeof makePrisma>;
  beforeEach(() => {
    t = makePrisma();
    [sendMail, ensurePaymentLinks, runMeteringSweep].forEach((x) => x.mockReset());
    t.m.cancel.upsert.mockResolvedValue({});
    t.m.org.findUnique.mockResolvedValue({ name: "Acme", settings: {} });
    t.m.user.findMany.mockResolvedValue([{ email: "a@x.com" }]);
  });

  it("creates a request, trims and caps the reason, and tells the owner and the customer", async () => {
    t.m.cancel.findUnique.mockResolvedValue(null);
    expect(await requestCancellation(t.prisma, { organizationId: "o1", userId: "u1", reason: `  ${"x".repeat(600)}  ` }, now)).toBe("created");
    const arg = t.m.cancel.upsert.mock.calls[0]![0];
    expect(arg.create).toMatchObject({ organizationId: "o1", status: "requested", requestedBy: "u1" });
    expect(arg.create.reason).toHaveLength(500);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map((c) => c[0].to)).toEqual(expect.arrayContaining(["info@conveys.in", ["a@x.com"]]));
  });
  it("refuses a second request while one is open or approved, but reopens a withdrawn one", async () => {
    for (const status of ["requested", "approved"]) {
      t.m.cancel.findUnique.mockResolvedValue({ status });
      expect(await requestCancellation(t.prisma, { organizationId: "o1", userId: "u1", reason: null }, now), status).toBe("exists");
    }
    expect(t.m.cancel.upsert).not.toHaveBeenCalled();
    t.m.cancel.findUnique.mockResolvedValue({ status: "withdrawn" });
    expect(await requestCancellation(t.prisma, { organizationId: "o1", userId: "u1", reason: "" }, now)).toBe("created");
    expect(t.m.cancel.upsert.mock.calls[0]![0].update).toMatchObject({ status: "requested", approvedAt: null, reason: null });
  });
  it("still records the request when an email fails", async () => {
    t.m.cancel.findUnique.mockResolvedValue(null);
    sendMail.mockRejectedValue(new Error("mail down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await requestCancellation(t.prisma, { organizationId: "o1", userId: "u1", reason: null }, now)).toBe("created");
    warn.mockRestore();
  });
  it("withdraws only an open request", async () => {
    t.m.cancel.updateMany.mockResolvedValue({ count: 1 });
    expect(await withdrawCancellation(t.prisma, "o1", now)).toBe(true);
    expect(t.m.cancel.updateMany.mock.calls[0]![0].where).toEqual({ organizationId: "o1", status: "requested" });
    t.m.cancel.updateMany.mockResolvedValue({ count: 0 });
    expect(await withdrawCancellation(t.prisma, "o1", now)).toBe(false);
  });
});

describe("final statement", () => {
  let t: ReturnType<typeof makePrisma>;
  // Registered 14 March: on 20 Nov the cycle is 14 Nov to 13 Dec, key 2026-11-14.
  const org = { name: "Acme", createdAt: new Date("2026-03-14T09:00:00Z") };
  beforeEach(() => {
    t = makePrisma();
    [sendMail, ensurePaymentLinks, runMeteringSweep].forEach((x) => x.mockReset());
    t.m.org.findUnique.mockResolvedValue(org);
    t.m.setting.findUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, chargingStartDate: "2026-10-12" } });
    t.m.statement.findFirst.mockResolvedValue(null);
    t.m.statement.create.mockResolvedValue({});
    t.m.usage.findMany.mockResolvedValue([{ billableCount: 2000 }, { billableCount: 1240 }]);
    runMeteringSweep.mockResolvedValue({ days: [], upserted: 0, removed: 0 });
    ensurePaymentLinks.mockResolvedValue(1);
  });

  it("applies the same bands to the messages counted so far (no proration) and issues it with a payment link", async () => {
    const res = await createFinalStatement(t.prisma, "o1", now);
    expect(res).toEqual({ created: true, month: "2026-11-14", messages: 3240, status: "issued" });
    expect(t.m.statement.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "o1", month: "2026-11-14", messages: 3240, bandName: "Band 1", status: "issued", issuedAt: now });
    expect(ensurePaymentLinks).toHaveBeenCalledTimes(1);
    expect(runMeteringSweep).toHaveBeenCalledTimes(1);
  });
  it("counts only this cycle's days up to today for this organization", async () => {
    await createFinalStatement(t.prisma, "o1", now);
    const where = t.m.usage.findMany.mock.calls[0]![0].where;
    expect(where.organizationId).toBe("o1");
    expect(where.day.gte).toEqual(new Date("2026-11-14T00:00:00Z"));
    expect(where.day.lt).toEqual(new Date(now.getTime() + DAY));
  });
  it("a customer under the free allowance gets a no-payment statement and no link", async () => {
    t.m.usage.findMany.mockResolvedValue([{ billableCount: 40 }]);
    const res = await createFinalStatement(t.prisma, "o1", now);
    expect(res).toMatchObject({ created: true, status: "no_payment" });
    expect(t.m.statement.create.mock.calls[0]![0].data).toMatchObject({ status: "no_payment", amountInr: 0 });
    expect(ensurePaymentLinks).not.toHaveBeenCalled();
  });
  it("charges the cap price however many messages were sent", async () => {
    t.m.usage.findMany.mockResolvedValue([{ billableCount: 900000 }]);
    await createFinalStatement(t.prisma, "o1", now);
    expect(t.m.statement.create.mock.calls[0]![0].data).toMatchObject({ amountInr: 7999, status: "issued" });
  });
  it("creates nothing before the charging start date, when charging is not configured, or for the owner's own organizations", async () => {
    t.m.setting.findUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, chargingStartDate: "2026-12-01" } });
    expect(await createFinalStatement(t.prisma, "o1", now)).toMatchObject({ created: false, reason: "not_billable" });
    t.m.setting.findUnique.mockResolvedValue(null);
    expect(await createFinalStatement(t.prisma, "o1", now)).toMatchObject({ created: false, reason: "not_billable" });
    t.m.setting.findUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, chargingStartDate: "2026-10-12" } });
    t.m.org.findUnique.mockResolvedValue({ ...org, name: "Conveys Information Technology" });
    expect(await createFinalStatement(t.prisma, "o1", now)).toMatchObject({ created: false, reason: "internal" });
    expect(t.m.statement.create).not.toHaveBeenCalled();
  });
  it("leaves an existing statement for the cycle alone", async () => {
    t.m.statement.findFirst.mockResolvedValue({ id: "st1" });
    expect(await createFinalStatement(t.prisma, "o1", now)).toMatchObject({ created: false, reason: "exists" });
    expect(t.m.statement.create).not.toHaveBeenCalled();
  });
});

describe("approve, reopen, and the 30 day window", () => {
  let t: ReturnType<typeof makePrisma>;
  beforeEach(() => {
    t = makePrisma();
    [sendMail, ensurePaymentLinks, runMeteringSweep].forEach((x) => x.mockReset());
    t.m.org.findUnique.mockResolvedValue({ name: "Acme", createdAt: new Date("2026-03-14T09:00:00Z"), settings: {} });
    t.m.user.findMany.mockResolvedValue([{ email: "a@x.com" }]);
    t.m.setting.findUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, chargingStartDate: "2026-10-12" } });
    t.m.statement.findFirst.mockResolvedValue(null);
    t.m.statement.create.mockResolvedValue({});
    t.m.usage.findMany.mockResolvedValue([{ billableCount: 3240 }]);
    runMeteringSweep.mockResolvedValue({});
    ensurePaymentLinks.mockResolvedValue(1);
  });

  it("approves an open request, issues the final statement and emails the customer", async () => {
    t.m.cancel.updateMany.mockResolvedValue({ count: 1 });
    const res = await approveCancellation(t.prisma, "o1", "admin-1", now);
    expect(res.approved).toBe(true);
    expect(res.statement).toMatchObject({ created: true, status: "issued" });
    expect(t.m.cancel.updateMany.mock.calls[0]![0]).toMatchObject({ where: { organizationId: "o1", status: "requested" }, data: { status: "approved", approvedAt: now, approvedBy: "admin-1" } });
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("cancelled") });
    expect(sendMail.mock.calls[0]![0].html).toContain(`${RETENTION_DAYS} days`);
  });
  it("does nothing when there is no open request (so it cannot be approved twice)", async () => {
    t.m.cancel.updateMany.mockResolvedValue({ count: 0 });
    expect(await approveCancellation(t.prisma, "o1", "admin-1", now)).toEqual({ approved: false });
    expect(t.m.statement.create).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("stays approved even if the final statement or the email fails", async () => {
    t.m.cancel.updateMany.mockResolvedValue({ count: 1 });
    t.m.usage.findMany.mockRejectedValue(new Error("db"));
    sendMail.mockRejectedValue(new Error("mail"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await approveCancellation(t.prisma, "o1", "admin-1", now)).approved).toBe(true);
    warn.mockRestore();
  });
  it("dismisses or reactivates only an open or approved cancellation", async () => {
    t.m.cancel.updateMany.mockResolvedValue({ count: 1 });
    expect(await reopenAccount(t.prisma, "o1", now)).toBe(true);
    expect(t.m.cancel.updateMany.mock.calls[0]![0].where).toEqual({ organizationId: "o1", status: { in: ["requested", "approved"] } });
    t.m.cancel.updateMany.mockResolvedValue({ count: 0 });
    expect(await reopenAccount(t.prisma, "o1", now)).toBe(false);
  });
  it("lists accounts whose 30 days are over, and computes the delete date", async () => {
    t.m.cancel.findMany.mockResolvedValue([{ organizationId: "o2", approvedAt: new Date("2026-10-01T00:00:00Z") }, { organizationId: "o3", approvedAt: null }]);
    const due = await deletionDue(t.prisma, now);
    expect(due).toEqual([{ organizationId: "o2", approvedAt: new Date("2026-10-01T00:00:00Z") }]);
    expect(t.m.cancel.findMany.mock.calls[0]![0].where).toEqual({ status: "approved", approvedAt: { lte: new Date(now.getTime() - 30 * DAY) } });
    expect(viewOf({ status: "approved", requestedAt: now, approvedAt: now }).deleteAfter?.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(viewOf({ status: "weird", requestedAt: now, approvedAt: null }).status).toBe("withdrawn");
  });
});
