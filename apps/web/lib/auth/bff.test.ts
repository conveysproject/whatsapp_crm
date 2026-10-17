import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAuthApi, resetBffWarningForTests } from "./bff";

describe("AUTH_BFF_SECRET sanity", () => {
  const req = new Request("https://app.test/x");
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetBffWarningForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    warn.mockRestore();
    delete process.env["AUTH_BFF_SECRET"];
  });

  it("warns once for a short secret without printing it", async () => {
    process.env["AUTH_BFF_SECRET"] = "short-secret-value";
    await callAuthApi("/v1/auth/x", { method: "POST", req });
    await callAuthApi("/v1/auth/x", { method: "POST", req });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("short-secret-value");
  });
  it("does not warn for a 32+ char secret or when unset", async () => {
    process.env["AUTH_BFF_SECRET"] = "x".repeat(32);
    await callAuthApi("/v1/auth/x", { method: "POST", req });
    delete process.env["AUTH_BFF_SECRET"];
    await callAuthApi("/v1/auth/x", { method: "POST", req });
    expect(warn).not.toHaveBeenCalled();
  });
});
