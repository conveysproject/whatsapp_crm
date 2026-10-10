import { describe, it, expect } from "vitest";
import { isBillingV2Enabled, graceDays } from "./flags.js";

describe("billing flags", () => {
  it("is enabled only for the exact string true", () => {
    expect(isBillingV2Enabled({ BILLING_V2_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(true);
    for (const v of [undefined, "", "1", "TRUE", "false"]) {
      expect(isBillingV2Enabled({ BILLING_V2_ENABLED: v } as NodeJS.ProcessEnv)).toBe(false);
    }
  });
  it("defaults the grace period to 7 days and rejects junk", () => {
    expect(graceDays({} as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "3" } as NodeJS.ProcessEnv)).toBe(3);
    expect(graceDays({ BILLING_GRACE_DAYS: "abc" } as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "-2" } as NodeJS.ProcessEnv)).toBe(7);
    expect(graceDays({ BILLING_GRACE_DAYS: "0" } as NodeJS.ProcessEnv)).toBe(7);
  });
});
