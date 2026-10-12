import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("../prisma.js", () => ({ prisma: {} }));

import {
  BLOCK_GRACE_DAYS, BillingBlockedError, standingFrom, isEnforcedBlock, readBlockSettings, isExempt,
  loadStanding, assertSendingAllowed, clearStandingCache, resetSendGuardCaches,
} from "./send-guard.js";
import { DEFAULT_BILLING_CONFIG, type BillingConfig } from "./bands.js";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe("standingFrom", () => {
  const st = (days: number, month = "2026-10-14") => ({ month, dueAt: ago(days) });

  it("is fine when nothing is overdue", () => {
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [] }).state).toBe("ok");
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [{ month: "m", dueAt: new Date(now.getTime() + DAY) }] }).state).toBe("ok");
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [{ month: "m", dueAt: null }] }).state).toBe("ok");
  });
  it("is overdue, not blocked, during the 7 day grace period", () => {
    const s = standingFrom({ mode: "enforce", now, exempt: false, statements: [st(1)] });
    expect(s.state).toBe("overdue");
    expect(s.blockAt?.getTime()).toBe(ago(1).getTime() + BLOCK_GRACE_DAYS * DAY);
    expect(isEnforcedBlock(s)).toBe(false);
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [st(6.99)] }).state).toBe("overdue");
  });
  it("is blocked exactly at 7 days after the due date", () => {
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [st(7)] }).state).toBe("blocked");
    expect(standingFrom({ mode: "enforce", now, exempt: false, statements: [st(30)] }).state).toBe("blocked");
  });
  it("uses the earliest overdue statement and lists every overdue month", () => {
    const s = standingFrom({ mode: "enforce", now, exempt: false, statements: [st(2, "b"), st(9, "a")] });
    expect(s.state).toBe("blocked");
    expect(s.overdueMonths).toEqual(["a", "b"]);
  });
  it("only refuses sends when enforcement is on; watch mode never refuses", () => {
    const watch = standingFrom({ mode: "watch", now, exempt: false, statements: [st(10)] });
    expect(watch.state).toBe("blocked");
    expect(isEnforcedBlock(watch)).toBe(false);
    expect(isEnforcedBlock(standingFrom({ mode: "enforce", now, exempt: false, statements: [st(10)] }))).toBe(true);
  });
  it("is always fine when blocking is off or the customer is exempt", () => {
    expect(standingFrom({ mode: "off", now, exempt: false, statements: [st(30)] }).state).toBe("ok");
    expect(standingFrom({ mode: "enforce", now, exempt: true, statements: [st(30)] }).state).toBe("ok");
  });
});

describe("exemptions", () => {
  it("exempts the owner's own organizations by name", () => {
    expect(isExempt("Conveys Information Technology", {}, now)).toBe(true);
    expect(isExempt("Pooyan's Organization", {}, now)).toBe(true);
    expect(isExempt("Acme", {}, now)).toBe(false);
  });
  it("honours a per-customer exemption and a pause that has not yet ended", () => {
    expect(isExempt("Acme", { billingBlock: { exempt: true } }, now)).toBe(true);
    expect(isExempt("Acme", { billingBlock: { pauseUntil: "2026-11-20" } }, now)).toBe(true);
    expect(isExempt("Acme", { billingBlock: { pauseUntil: "2026-11-19" } }, now)).toBe(false);
  });
  it("reads malformed settings as no override", () => {
    for (const s of [null, undefined, "x", [], {}, { billingBlock: null }, { billingBlock: { exempt: "yes", pauseUntil: "garbage" } }]) {
      expect(readBlockSettings(s)).toEqual({ exempt: false, pauseUntil: null });
    }
  });
});

describe("loadStanding and assertSendingAllowed", () => {
  const orgFindUnique = vi.fn();
  const orgFindFirst = vi.fn();
  const vsFindFirst = vi.fn();
  const stFindMany = vi.fn();
  const settingFindUnique = vi.fn();
  const cancelFind = vi.fn();
  const prisma = {
    organization: { findUnique: orgFindUnique, findFirst: orgFindFirst },
    vendorSetting: { findFirst: vsFindFirst },
    billingStatement: { findMany: stFindMany },
    billingSetting: { findUnique: settingFindUnique },
    billingCancellation: { findUnique: cancelFind },
  } as unknown as PrismaClient;
  const cfg = (mode: string): { value: BillingConfig } => ({ value: { ...DEFAULT_BILLING_CONFIG, blockingMode: mode as never } });

  beforeEach(() => {
    [orgFindUnique, orgFindFirst, vsFindFirst, stFindMany, settingFindUnique, cancelFind].forEach((m) => m.mockReset());
    cancelFind.mockResolvedValue(null);
    resetSendGuardCaches();
    orgFindUnique.mockResolvedValue({ name: "Acme", settings: {} });
    orgFindFirst.mockResolvedValue({ id: "o1" });
    stFindMany.mockResolvedValue([{ month: "2026-10-14", dueAt: ago(10) }]);
    settingFindUnique.mockResolvedValue(cfg("enforce"));
  });

  it("queries only issued statements that have a payment link and are past due, for that organization", async () => {
    await loadStanding(prisma, "o1", now);
    expect(stFindMany.mock.calls[0]![0].where).toEqual({ organizationId: "o1", status: "issued", paymentUrl: { not: null }, dueAt: { lt: now } });
  });
  it("refuses a send with a 402 error once enforcement is on and the grace period has passed", async () => {
    const err = await assertSendingAllowed("pn1", prisma, now).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BillingBlockedError);
    expect((err as BillingBlockedError).statusCode).toBe(402);
    expect((err as BillingBlockedError).code).toBe("BILLING_OVERDUE");
    expect((err as Error).message).toContain("Pay it in Settings > Billing");
  });
  it("lets the send through in watch mode and records it once per day", async () => {
    settingFindUnique.mockResolvedValue(cfg("watch"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("WATCH")).length).toBe(1);
    warn.mockRestore();
  });
  it("lets the send through inside the grace period, with blocking off, and for exempt customers", async () => {
    stFindMany.mockResolvedValue([{ month: "m", dueAt: ago(3) }]);
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
    resetSendGuardCaches();
    stFindMany.mockResolvedValue([{ month: "m", dueAt: ago(30) }]);
    settingFindUnique.mockResolvedValue(cfg("off"));
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
    resetSendGuardCaches();
    settingFindUnique.mockResolvedValue(cfg("enforce"));
    orgFindUnique.mockResolvedValue({ name: "Conveys Information Technology", settings: {} });
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
  });
  it("resolves the organization through the vendor setting when the phone is not on the organization", async () => {
    orgFindFirst.mockResolvedValue(null);
    vsFindFirst.mockResolvedValue({ organizationId: "o1" });
    await expect(assertSendingAllowed("pn1", prisma, now)).rejects.toBeInstanceOf(BillingBlockedError);
  });
  it("fails open: an unknown phone number or any lookup failure never blocks a send", async () => {
    orgFindFirst.mockResolvedValue(null);
    vsFindFirst.mockResolvedValue(null);
    await expect(assertSendingAllowed("unknown", prisma, now)).resolves.toBeUndefined();
    resetSendGuardCaches();
    orgFindFirst.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
    warn.mockRestore();
    resetSendGuardCaches();
    orgFindFirst.mockResolvedValue({ id: "o1" });
    stFindMany.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(assertSendingAllowed("pn1", prisma, now)).resolves.toBeUndefined();
  });
  it("always refuses a cancelled account, with its own error, even when blocking is off", async () => {
    cancelFind.mockResolvedValue({ status: "approved" });
    for (const mode of ["off", "watch", "enforce"]) {
      resetSendGuardCaches();
      settingFindUnique.mockResolvedValue(cfg(mode));
      stFindMany.mockResolvedValue([]);
      const err = await assertSendingAllowed("pn1", prisma, now).catch((e: unknown) => e);
      expect(err, mode).toBeInstanceOf(BillingBlockedError);
      expect((err as BillingBlockedError).code).toBe("ACCOUNT_CANCELLED");
      expect((err as Error).message).toContain("cancelled");
    }
  });
  it("does not block for a request that is only requested or was withdrawn", async () => {
    stFindMany.mockResolvedValue([]);
    for (const status of ["requested", "withdrawn"]) {
      resetSendGuardCaches();
      cancelFind.mockResolvedValue({ status });
      await expect(assertSendingAllowed("pn1", prisma, now), status).resolves.toBeUndefined();
    }
  });
  it("still applies the overdue rules when the cancellation lookup fails", async () => {
    cancelFind.mockRejectedValue(new Error("no table yet"));
    const err = await assertSendingAllowed("pn1", prisma, now).catch((e: unknown) => e);
    expect((err as BillingBlockedError).code).toBe("BILLING_OVERDUE");
  });
  it("caches a standing for a minute, and paying clears it at once", async () => {
    await expect(assertSendingAllowed("pn1", prisma, now)).rejects.toBeInstanceOf(BillingBlockedError);
    stFindMany.mockResolvedValue([]);
    await expect(assertSendingAllowed("pn1", prisma, new Date(now.getTime() + 30_000))).rejects.toBeInstanceOf(BillingBlockedError);
    clearStandingCache("o1");
    await expect(assertSendingAllowed("pn1", prisma, new Date(now.getTime() + 31_000))).resolves.toBeUndefined();
  });
});
