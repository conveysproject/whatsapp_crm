import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkPlanLimit, isFeatureEnabled } from "./plan-limits.js";

const m = {
  vendorSetting: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
  contact: { count: vi.fn() },
  campaign: { count: vi.fn() },
  chatbot: { count: vi.fn() },
  flow: { count: vi.fn() },
  contactCustomField: { count: vi.fn() },
  user: { count: vi.fn() },
};
const prisma = m as unknown as PrismaClient;

const ENV_KEYS = ["BILLING_V2_ENABLED", "BILLING_ENTITLEMENTS_ENFORCE", "BILLING_ENTITLEMENTS_ENFORCE_AFTER"] as const;
const saved: Record<string, string | undefined> = {};
let warn: MockInstance<Parameters<typeof console.warn>, void>;

function org(planTier: string, createdAt = new Date("2026-01-01T00:00:00Z")) {
  m.organization.findUnique.mockResolvedValue({ planTier, createdAt });
}
function row(value: string | null) {
  m.vendorSetting.findFirst.mockResolvedValue({ value });
}
function campaigns(n: number) {
  m.campaign.count.mockResolvedValue(n);
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const g of Object.values(m)) for (const fn of Object.values(g)) fn.mockReset();
  m.vendorSetting.findFirst.mockResolvedValue(null);
  m.organization.findUnique.mockResolvedValue(null);
  for (const c of [m.contact, m.campaign, m.chatbot, m.flow, m.contactCustomField, m.user]) c.count.mockResolvedValue(0);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  warn.mockRestore();
});

describe("flags off (regression guard)", () => {
  it("no row is unlimited and does not query organization", async () => {
    m.contact.count.mockResolvedValue(7);
    expect(await checkPlanLimit(prisma, "org-1", "contacts")).toEqual({ allowed: true, limit: -1, current: 7 });
    expect(m.organization.findUnique).not.toHaveBeenCalled();
  });
  it("row 5 with current 5 blocks", async () => {
    row("5");
    campaigns(5);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: false, limit: 5, current: 5 });
  });
  it("row -1 and row abc are unlimited", async () => {
    campaigns(9);
    row("-1");
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 9 });
    row("abc");
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 9 });
  });
  it("features: row 1 true, no row false, no org query", async () => {
    row("1");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(true);
    m.vendorSetting.findFirst.mockResolvedValue(null);
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
    expect(m.organization.findUnique).not.toHaveBeenCalled();
  });
  it("BILLING_V2_ENABLED other than 'true' is off", async () => {
    process.env["BILLING_V2_ENABLED"] = "1";
    await checkPlanLimit(prisma, "org-1", "campaigns");
    expect(m.organization.findUnique).not.toHaveBeenCalled();
  });
});

describe("shadow", () => {
  beforeEach(() => {
    process.env["BILLING_V2_ENABLED"] = "true";
  });
  it("starter over limit: unchanged result, logs shadow_block", async () => {
    org("starter");
    campaigns(6);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 6 });
    expect(warn).toHaveBeenCalledWith("[entitlements] shadow_block", { organizationId: "org-1", entity: "campaigns", current: 6, limit: 5 });
  });
  it("under limit logs nothing", async () => {
    org("starter");
    campaigns(4);
    await checkPlanLimit(prisma, "org-1", "campaigns");
    expect(warn).not.toHaveBeenCalled();
  });
  it("feature: growth logs shadow_enable, returns false", async () => {
    org("growth");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
    expect(warn).toHaveBeenCalledWith("[entitlements] shadow_enable", { organizationId: "org-1", feature: "api_access" });
  });
  it("feature: starter false, no log", async () => {
    org("starter");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("enforce", () => {
  beforeEach(() => {
    process.env["BILLING_V2_ENABLED"] = "true";
    process.env["BILLING_ENTITLEMENTS_ENFORCE"] = "true";
  });
  it("starter at limit blocked, under allowed", async () => {
    org("starter");
    campaigns(5);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: false, limit: 5, current: 5 });
    campaigns(4);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: 5, current: 4 });
  });
  it("scale, enterprise and unknown tier are unlimited", async () => {
    campaigns(1000);
    for (const t of ["scale", "enterprise", "mystery"]) {
      org(t);
      expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 1000 });
    }
  });
  it("override wins", async () => {
    org("starter");
    campaigns(50);
    row("100");
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: 100, current: 50 });
    row("-1");
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 50 });
    row("2");
    campaigns(2);
    expect((await checkPlanLimit(prisma, "org-1", "campaigns")).allowed).toBe(false);
  });
  it("null-valued row is an unlimited override", async () => {
    org("starter");
    campaigns(50);
    row(null);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 50 });
  });
  it("features follow tier, row wins", async () => {
    org("growth");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(true);
    org("starter");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
    row("0");
    org("growth");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
    row("true");
    org("starter");
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(true);
  });
});

describe("grandfather", () => {
  it("org created before cutover behaves as shadow; after is enforced", async () => {
    process.env["BILLING_V2_ENABLED"] = "true";
    process.env["BILLING_ENTITLEMENTS_ENFORCE"] = "true";
    process.env["BILLING_ENTITLEMENTS_ENFORCE_AFTER"] = "2026-11-01T00:00:00Z";
    campaigns(6);
    org("starter", new Date("2026-10-01T00:00:00Z"));
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 6 });
    expect(warn).toHaveBeenCalledWith("[entitlements] shadow_block", expect.any(Object));
    org("starter", new Date("2026-11-02T00:00:00Z"));
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: false, limit: 5, current: 6 });
  });
});

describe("fail safe", () => {
  beforeEach(() => {
    process.env["BILLING_V2_ENABLED"] = "true";
    process.env["BILLING_ENTITLEMENTS_ENFORCE"] = "true";
    campaigns(50);
  });
  it("missing org behaves as today", async () => {
    m.organization.findUnique.mockResolvedValue(null);
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 50 });
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
  });
  it("rejecting org lookup behaves as today", async () => {
    m.organization.findUnique.mockRejectedValue(new Error("db down"));
    expect(await checkPlanLimit(prisma, "org-1", "campaigns")).toEqual({ allowed: true, limit: -1, current: 50 });
    expect(await isFeatureEnabled(prisma, "org-1", "api_access")).toBe(false);
  });
});
