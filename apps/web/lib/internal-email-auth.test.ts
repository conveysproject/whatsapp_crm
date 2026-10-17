import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.fn();
const clerkVerify = vi.fn();
vi.mock("./auth/jwt", () => ({ verifyAccessToken: (t: string) => verifyAccessToken(t) }));
vi.mock("@clerk/nextjs/server", () => ({ verifyToken: (...a: unknown[]) => clerkVerify(...a) }));

import { isAuthorized } from "./internal-email-auth";

const SECRET = "a".repeat(40);
const JWT = "eyJhbGciOi.payload.sig";

describe("isAuthorized", () => {
  beforeEach(() => {
    verifyAccessToken.mockReset();
    clerkVerify.mockReset();
    vi.stubEnv("INTERNAL_EMAIL_SECRET", SECRET);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects empty token", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "wbmsg");
    expect(await isAuthorized("")).toBe(false);
  });

  describe("wbmsg mode", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "wbmsg"));
    it("accepts a valid access token", async () => {
      verifyAccessToken.mockResolvedValue({ userId: "u", sid: "s", typ: "user" });
      expect(await isAuthorized(JWT)).toBe(true);
      expect(clerkVerify).not.toHaveBeenCalled();
    });
    it("rejects forged or expired tokens", async () => {
      verifyAccessToken.mockResolvedValue(null);
      expect(await isAuthorized(JWT)).toBe(false);
    });
    it("accepts the internal secret", async () => {
      expect(await isAuthorized(SECRET)).toBe(true);
      expect(verifyAccessToken).not.toHaveBeenCalled();
    });
    it("rejects a wrong secret", async () => {
      expect(await isAuthorized("b".repeat(40))).toBe(false);
    });
  });

  describe("clerk mode", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "clerk"));
    it("accepts a token Clerk verifies", async () => {
      clerkVerify.mockResolvedValue({ sub: "user_1" });
      expect(await isAuthorized(JWT)).toBe(true);
      expect(verifyAccessToken).not.toHaveBeenCalled();
    });
    it("rejects when Clerk throws", async () => {
      clerkVerify.mockRejectedValue(new Error("bad"));
      expect(await isAuthorized(JWT)).toBe(false);
    });
    it("accepts the internal secret", async () => {
      expect(await isAuthorized(SECRET)).toBe(true);
    });
  });
});
