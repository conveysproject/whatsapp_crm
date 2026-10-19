import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tokens.js", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("./sessions.js", () => ({ isSessionRevoked: vi.fn() }));

import { verifyAccessToken } from "./tokens.js";
import { isSessionRevoked } from "./sessions.js";
import { isVersionLower, mobileUpgradeRequired, verifyBearer } from "./identity.js";

const saved = { m: process.env.AUTH_MIN_MOBILE_VERSION };
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  if (saved.m === undefined) delete process.env.AUTH_MIN_MOBILE_VERSION;
  else process.env.AUTH_MIN_MOBILE_VERSION = saved.m;
});

describe("verifyBearer", () => {
  it("accepts our token", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "u2", sid: "s1", typ: "admin" });
    vi.mocked(isSessionRevoked).mockResolvedValue(false);
    await expect(verifyBearer("Bearer abc")).resolves.toEqual({ userId: "u2", sid: "s1", typ: "admin" });
    expect(verifyAccessToken).toHaveBeenCalledWith("abc");
  });

  it("rejects a revoked session", async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "u2", sid: "s1", typ: "user" });
    vi.mocked(isSessionRevoked).mockResolvedValue(true);
    await expect(verifyBearer("Bearer abc")).rejects.toThrow();
  });

  it("rejects a foreign token and a missing header", async () => {
    vi.mocked(verifyAccessToken).mockRejectedValue(new Error("bad signature"));
    await expect(verifyBearer("Bearer foreign.jwt.token")).rejects.toThrow();
    await expect(verifyBearer(undefined)).rejects.toThrow();
  });
});

describe("version gate helpers", () => {
  it("compares dotted versions numerically", () => {
    expect(isVersionLower("1.9.0", "1.10.0")).toBe(true);
    expect(isVersionLower("1.10.0", "1.9.0")).toBe(false);
    expect(isVersionLower("1.2", "1.2.0")).toBe(false);
    expect(isVersionLower("2.0.0", "1.99.99")).toBe(false);
  });
  it("is off without a minimum", () => {
    delete process.env.AUTH_MIN_MOBILE_VERSION;
    expect(mobileUpgradeRequired({ "x-app-client": "mobile" })).toBe(false);
  });
  it("warns once when AUTH_MIN_MOBILE_VERSION is set but unparseable, without echoing secrets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AUTH_MIN_MOBILE_VERSION = "not-a-version";
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/AUTH_MIN_MOBILE_VERSION/);
    warn.mockRestore();
  });
  it("does not warn for a valid version", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AUTH_MIN_MOBILE_VERSION = "2.1.0";
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
