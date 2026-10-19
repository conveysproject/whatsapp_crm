import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendMail = vi.fn();
vi.mock("../../../../lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock("../../../../lib/auth/jwt", () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ userId: "u" }) }));

import { POST } from "./route";

const SECRET = "s".repeat(40);
const req = (token: string) =>
  new NextRequest("http://localhost/api/internal/send-email", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to: "victim@example.com", subject: "hi", html: "<p>x</p>" }),
  });

describe("POST /api/internal/send-email", () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    vi.stubEnv("INTERNAL_EMAIL_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends for the internal secret", async () => {
    expect((await POST(req(SECRET))).status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it("blocks a signed-in user's token", async () => {
    expect((await POST(req("eyJhbGciOi.payload.sig"))).status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("blocks a missing token", async () => {
    expect((await POST(req(""))).status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
