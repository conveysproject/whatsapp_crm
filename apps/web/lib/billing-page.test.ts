import { describe, it, expect } from "vitest";
import { normalizeUsage, canViewBilling } from "./billing-page";

describe("normalizeUsage", () => {
  it("maps the current gates shape; null limit means unlimited", () => {
    const u = normalizeUsage({ plan: "starter", unavailableFeatures: [], gates: {
      contacts: { current: 100, limit: 500, allowed: true },
      campaigns: { current: 2, limit: null, allowed: true },
      ai_chat_bot: { enabled: true },
    } });
    expect(u?.plan).toBe("starter");
    expect(u?.rows).toEqual([
      { key: "contacts", label: "Contacts", used: 100, limit: 500 },
      { key: "campaigns", label: "Campaigns", used: 2, limit: null },
    ]);
  });
  it("tolerates the old/unknown shape and junk", () => {
    expect(normalizeUsage({ plan: "growth", usage: { contacts: 1 }, limits: {} })).toEqual({ plan: "growth", rows: [] });
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage("x")).toBeNull();
    expect(normalizeUsage({ plan: "starter", gates: { contacts: { current: "a" } } })).toEqual({ plan: "starter", rows: [] });
  });
});

describe("canViewBilling", () => {
  const u = (role: string, permissions: Record<string, string> = {}) => ({ id: "1", fullName: "A", email: "a@b.c", role, permissions });
  it("allows admin and superAdmin", () => {
    expect(canViewBilling(u("admin"))).toBe(true);
    expect(canViewBilling(u("superAdmin"))).toBe(true);
  });
  it("allows a manager only with the sub permission", () => {
    expect(canViewBilling(u("manager"))).toBe(false);
    expect(canViewBilling(u("manager", { settings_access: "allow", "settings_access@settings_billing": "allow" }))).toBe(true);
  });
  it("denies a missing user", () => { expect(canViewBilling(null)).toBe(false); });
});
