import { describe, it, expect } from "vitest";
import { isPlatformOnlyPath } from "./demo-guard.js";

describe("isPlatformOnlyPath", () => {
  it("blocks platform admin prefixes", () => {
    for (const p of ["/v1/admin", "/v1/admin/", "/v1/admin/organizations", "/v1/super-admins", "/v1/super-admins/abc", "/v1/admin/billing/usage"]) {
      expect(isPlatformOnlyPath(p), p).toBe(true);
    }
  });

  it("blocks platform-only billing routes by concrete path and by route pattern", () => {
    for (const p of [
      "/v1/billing/manual/ms-1/approve", "/v1/billing/manual/ms-1/reject", "/v1/billing/stripe/setup-webhook",
      "/v1/billing/manual/:id/approve", "/v1/billing/manual/:id/reject",
    ]) {
      expect(isPlatformOnlyPath(p), p).toBe(true);
    }
  });

  it("is not fooled by case or repeated slashes", () => {
    for (const p of ["/V1/ADMIN/x", "//v1//admin//x", "/v1//super-admins", "/v1/Billing/Manual/ms-1/Approve"]) {
      expect(isPlatformOnlyPath(p), p).toBe(true);
    }
  });

  it("does not block ordinary customer routes or look-alike prefixes", () => {
    for (const p of [
      "/v1/contacts", "/v1/administrator", "/v1/admins", "/v1/billing/usage", "/v1/billing/message-usage",
      "/v1/billing/manual/submit-proof", "/v1/billing/manual/cancel-request", "/v1/billing/checkout", "/probe", "",
    ]) {
      expect(isPlatformOnlyPath(p), p).toBe(false);
    }
  });
});
