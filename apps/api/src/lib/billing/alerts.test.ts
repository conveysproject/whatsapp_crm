import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_BILLING_CONFIG, type BillingConfig } from "./bands.js";

const sendMail = vi.fn();
vi.mock("../mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { kindsReached, evaluateAlerts, highestKind, alertMessage, monthKey } from "./alerts.js";

const published: BillingConfig = { ...DEFAULT_BILLING_CONFIG, published: true };

describe("kindsReached", () => {
  it("reports free-allowance steps as the count grows", () => {
    expect(kindsReached(0, DEFAULT_BILLING_CONFIG)).toEqual([]);
    expect(kindsReached(249, DEFAULT_BILLING_CONFIG)).toEqual([]);
    expect(kindsReached(250, DEFAULT_BILLING_CONFIG)).toEqual(["free_50"]);
    expect(kindsReached(400, DEFAULT_BILLING_CONFIG)).toEqual(["free_50", "free_80"]);
    expect(kindsReached(475, DEFAULT_BILLING_CONFIG)).toEqual(["free_50", "free_80", "free_95"]);
    expect(kindsReached(500, DEFAULT_BILLING_CONFIG)).toEqual(["free_50", "free_80", "free_95", "free_100"]);
  });
  it("never reports band alerts while prices are unpublished", () => {
    expect(kindsReached(60_000, DEFAULT_BILLING_CONFIG).some((k) => k.startsWith("band") || k === "above")).toBe(false);
  });
  it("reports each band entered once published", () => {
    expect(kindsReached(500, published)).not.toContain("band_1");
    expect(kindsReached(501, published)).toContain("band_1");
    expect(kindsReached(10_001, published)).toEqual(expect.arrayContaining(["band_1", "band_2"]));
    expect(kindsReached(250_001, published)).toContain("above");
  });
  it("handles a zero free allowance without dividing or alerting on nothing", () => {
    expect(kindsReached(0, { ...DEFAULT_BILLING_CONFIG, freeAllowance: 0 })).toEqual([]);
  });
});

describe("helpers", () => {
  it("ranks the highest kind", () => {
    expect(highestKind(["free_50", "free_95", "free_80"])).toBe("free_95");
    expect(highestKind(["free_100", "band_1"])).toBe("band_1");
    expect(highestKind(["band_1", "band_2", "above"])).toBe("above");
    expect(highestKind([])).toBeNull();
  });
  it("words alerts without prices", () => {
    expect(alertMessage("free_80", 400, 500).text).toContain("80%");
    expect(alertMessage("free_100", 500, 500).subject).toContain("used your free messages");
    expect(alertMessage("band_1", 600, 500).text).not.toMatch(/₹|\$/);
  });
  it("keys months in UTC", () => {
    expect(monthKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(monthKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });
});

describe("evaluateAlerts", () => {
  const groupBy = vi.fn();
  const createMany = vi.fn();
  const findMany = vi.fn();
  const updateMany = vi.fn();
  const userFindMany = vi.fn();
  const findUnique = vi.fn();
  const prisma = {
    messageUsageDaily: { groupBy },
    billingAlertEvent: { createMany, findMany, updateMany },
    user: { findMany: userFindMany },
    billingSetting: { findUnique },
  } as unknown as PrismaClient;
  const now = new Date("2026-10-15T10:00:00Z");

  beforeEach(() => {
    [groupBy, createMany, findMany, updateMany, userFindMany, findUnique, sendMail].forEach((m) => m.mockReset());
    findUnique.mockResolvedValue(null);
    groupBy.mockResolvedValue([{ organizationId: "o1", _sum: { billableCount: 430 } }]);
    createMany.mockResolvedValue({ count: 2 });
    findMany.mockResolvedValue([]);
  });

  it("records reached thresholds idempotently and sends nothing while emails are off", async () => {
    const res = await evaluateAlerts(prisma, now);
    expect(res).toEqual({ recorded: 2, emailed: 0 });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: "o1", month: "2026-10", kind: "free_50", messages: 430 },
        { organizationId: "o1", month: "2026-10", kind: "free_80", messages: 430 },
      ],
      skipDuplicates: true,
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("emails billing admins one message per organization, highest threshold, and marks all sent", async () => {
    findUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, alertsEnabled: true } });
    findMany.mockResolvedValue([
      { id: "e1", organizationId: "o1", kind: "free_50", messages: 430 },
      { id: "e2", organizationId: "o1", kind: "free_80", messages: 430 },
    ]);
    userFindMany.mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]);
    const res = await evaluateAlerts(prisma, now);
    expect(res.emailed).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com", "b@x.com"], subject: expect.stringContaining("80%") });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["e1", "e2"] }, emailedAt: null }, data: { emailedAt: now } });
    expect(userFindMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "o1", role: "admin", isActive: true });
  });

  it("never throws when the database fails", async () => {
    groupBy.mockRejectedValue(new Error("down"));
    await expect(evaluateAlerts(prisma, now)).resolves.toEqual({ recorded: 0, emailed: 0 });
  });
});
