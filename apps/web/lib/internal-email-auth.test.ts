import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyAccessToken = vi.fn();
const clerkVerify = vi.fn();
vi.mock("./auth/jwt", () => ({ verifyAccessToken: (t: string) => verifyAccessToken(t) }));
vi.mock("@clerk/nextjs/server", () => ({ verifyToken: (...a: unknown[]) => clerkVerify(...a) }));

import { isAuthorized } from "./internal-email-auth";

const SECRET = "a".repeat(40);
const JWT = "eyJhbGciOi.payload.sig";

describe.each(["wbmsg", "clerk"])("isAuthorized (%s mode)", (mode) => {
  beforeEach(() => {
    verifyAccessToken.mockReset().mockResolvedValue({ userId: "u", sid: "s", typ: "user" });
    clerkVerify.mockReset().mockResolvedValue({ sub: "user_1" });
    vi.stubEnv("INTERNAL_EMAIL_SECRET", SECRET);
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", mode);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts the internal secret", async () => {
    expect(await isAuthorized(SECRET)).toBe(true);
  });
  it("rejects a valid signed-in user token (no relay for users)", async () => {
    expect(await isAuthorized(JWT)).toBe(false);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(clerkVerify).not.toHaveBeenCalled();
  });
  it("rejects empty and wrong tokens", async () => {
    expect(await isAuthorized("")).toBe(false);
    expect(await isAuthorized("b".repeat(40))).toBe(false);
  });
  it("rejects everything when the secret is unset or too short", async () => {
    vi.stubEnv("INTERNAL_EMAIL_SECRET", "short");
    expect(await isAuthorized("short")).toBe(false);
  });
});
