import { describe, it, expect } from "vitest";
import { ERROR_CATALOG, apiErrorBody } from "./error-catalog.js";

describe("error catalog", () => {
  it("every entry has a sentence and none mentions the old provider name", () => {
    for (const [code, e] of Object.entries(ERROR_CATALOG)) {
      expect(e.message.length, code).toBeGreaterThan(10);
      expect(JSON.stringify(e).toLowerCase(), code).not.toContain("plivo");
    }
  });
  it("builds {api_id, error, error_code, hint} and honours overrides and a fixed api_id", () => {
    const b = apiErrorBody("RATE_LIMITED", { hint: "Wait 30 seconds.", apiId: "abc" });
    expect(b).toEqual({ api_id: "abc", error: ERROR_CATALOG.RATE_LIMITED!.message, error_code: "RATE_LIMITED", hint: "Wait 30 seconds." });
    expect(apiErrorBody("VALIDATION_FAILED", { message: "dst is required" }).error).toBe("dst is required");
  });
  it("generates an api_id when none is given", () => {
    expect(apiErrorBody("INTERNAL_ERROR").api_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
