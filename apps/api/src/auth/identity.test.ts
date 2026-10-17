import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/clerk.js", () => ({ verifyClerkToken: vi.fn() }));
vi.mock("./tokens.js", () => ({ verifyAccessToken: vi.fn() }));
vi.mock("./sessions.js", () => ({ isSessionRevoked: vi.fn() }));

import { verifyClerkToken } from "../lib/clerk.js";
import { verifyAccessToken } from "./tokens.js";
import { isSessionRevoked } from "./sessions.js";
import { isVersionLower, mobileUpgradeRequired, verifyBearer } from "./identity.js";

const saved = { p: process.env.AUTH_PROVIDER, m: process.env.AUTH_MIN_MOBILE_VERSION };
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  if (saved.p === undefined) delete process.env.AUTH_PROVIDER;
  else process.env.AUTH_PROVIDER = saved.p;
  if (saved.m === undefined) delete process.env.AUTH_MIN_MOBILE_VERSION;
  else process.env.AUTH_MIN_MOBILE_VERSION = saved.m;
});

describe("verifyBearer", () => {
  it.each([undefined, "clerk"])("delegates to Clerk when AUTH_PROVIDER=%s", async (p) => {
    if (p === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = p;
    vi.mocked(verifyClerkToken).mockResolvedValue({ userId: "u1" } as never);
    await expect(verifyBearer("Bearer x")).resolves.toEqual({ userId: "u1", sid: null, typ: "user" });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("accepts our token in wbmsg mode", async () => {
    process.env.AUTH_PROVIDER = "wbmsg";
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "u2", sid: "s1", typ: "admin" });
    vi.mocked(isSessionRevoked).mockResolvedValue(false);
    await expect(verifyBearer("Bearer abc")).resolves.toEqual({ userId: "u2", sid: "s1", typ: "admin" });
    expect(verifyAccessToken).toHaveBeenCalledWith("abc");
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });

  it("rejects a revoked session in wbmsg mode", async () => {
    process.env.AUTH_PROVIDER = "wbmsg";
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: "u2", sid: "s1", typ: "user" });
    vi.mocked(isSessionRevoked).mockResolvedValue(true);
    await expect(verifyBearer("Bearer abc")).rejects.toThrow();
  });

  it("rejects a Clerk-shaped token and a missing header in wbmsg mode", async () => {
    process.env.AUTH_PROVIDER = "wbmsg";
    vi.mocked(verifyAccessToken).mockRejectedValue(new Error("bad signature"));
    await expect(verifyBearer("Bearer clerk.jwt.token")).rejects.toThrow();
    await expect(verifyBearer(undefined)).rejects.toThrow();
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });
});

describe("version gate helpers", () => {
  it("compares dotted versions numerically", () => {
    expect(isVersionLower("1.9.0", "1.10.0")).toBe(true);
    expect(isVersionLower("1.10.0", "1.9.0")).toBe(false);
    expect(isVersionLower("1.2", "1.2.0")).toBe(false);
    expect(isVersionLower("2.0.0", "1.99.99")).toBe(false);
  });
  it("is off outside wbmsg mode or without a minimum", () => {
    delete process.env.AUTH_PROVIDER;
    process.env.AUTH_MIN_MOBILE_VERSION = "1.0.0";
    expect(mobileUpgradeRequired({ "x-app-client": "mobile" })).toBe(false);
    process.env.AUTH_PROVIDER = "wbmsg";
    delete process.env.AUTH_MIN_MOBILE_VERSION;
    expect(mobileUpgradeRequired({ "x-app-client": "mobile" })).toBe(false);
  });
  it("warns once when AUTH_MIN_MOBILE_VERSION is set but unparseable, without echoing secrets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AUTH_PROVIDER = "wbmsg";
    process.env.AUTH_MIN_MOBILE_VERSION = "not-a-version";
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/AUTH_MIN_MOBILE_VERSION/);
    warn.mockRestore();
  });
  it("does not warn for a valid version", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AUTH_PROVIDER = "wbmsg";
    process.env.AUTH_MIN_MOBILE_VERSION = "2.1.0";
    mobileUpgradeRequired({ "x-app-client": "mobile", "x-app-version": "1.0.0" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
