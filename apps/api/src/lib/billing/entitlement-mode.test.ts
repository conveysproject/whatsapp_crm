import { describe, it, expect } from "vitest";
import { resolveEntitlementMode } from "./entitlement-mode.js";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const org = (iso: string) => ({ createdAt: new Date(iso) });

describe("resolveEntitlementMode", () => {
  it("is off without the V2 flag, or without an org", () => {
    expect(resolveEntitlementMode(org("2026-01-01"), env({}))).toBe("off");
    expect(resolveEntitlementMode(org("2026-01-01"), env({ BILLING_ENTITLEMENTS_ENFORCE: "true" }))).toBe("off");
    expect(resolveEntitlementMode(null, env({ BILLING_V2_ENABLED: "true" }))).toBe("off");
  });
  it("is shadow when V2 is on but enforcement is not exactly true", () => {
    for (const v of [undefined, "", "1", "TRUE", "false"]) {
      const e = env({ BILLING_V2_ENABLED: "true", ...(v === undefined ? {} : { BILLING_ENTITLEMENTS_ENFORCE: v }) });
      expect(resolveEntitlementMode(org("2026-01-01"), e)).toBe("shadow");
    }
  });
  it("enforces when on, with no cutover date", () => {
    expect(resolveEntitlementMode(org("2026-01-01"), env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true" }))).toBe("enforce");
  });
  it("grandfathers orgs created before the cutover and enforces newer ones", () => {
    const e = env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true", BILLING_ENTITLEMENTS_ENFORCE_AFTER: "2026-11-01T00:00:00Z" });
    expect(resolveEntitlementMode(org("2026-10-31T23:59:59Z"), e)).toBe("shadow");
    expect(resolveEntitlementMode(org("2026-11-01T00:00:00Z"), e)).toBe("enforce");
  });
  it("treats an invalid cutover date as shadow (fail safe)", () => {
    const e = env({ BILLING_V2_ENABLED: "true", BILLING_ENTITLEMENTS_ENFORCE: "true", BILLING_ENTITLEMENTS_ENFORCE_AFTER: "not-a-date" });
    expect(resolveEntitlementMode(org("2027-01-01"), e)).toBe("shadow");
  });
});
