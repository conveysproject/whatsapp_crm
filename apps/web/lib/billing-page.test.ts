import { describe, it, expect } from "vitest";
import { canViewBilling } from "./billing-page";

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
