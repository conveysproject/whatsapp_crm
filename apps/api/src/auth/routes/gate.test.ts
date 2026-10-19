import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const m = vi.hoisted(() => ({
  hitLimit: vi.fn(),
  issueCode: vi.fn(),
  sendCodeEmail: vi.fn(),
}));
vi.mock("../limits.js", () => ({ hitLimit: m.hitLimit, authClientIp: () => "9.9.9.9" }));
vi.mock("../codes.js", () => ({ issueCode: m.issueCode, verifyCode: vi.fn(), verifyCodeById: vi.fn() }));
vi.mock("../emails.js", () => ({ sendCodeEmail: m.sendCodeEmail }));

import { authRouter } from "./index.js";

const prisma = {
  authAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
};

describe("auth module", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    app.decorate("prisma", prisma as any);
    await app.register(authRouter, { prefix: "/v1/auth" });
  });
  afterEach(async () => {
    await app.close();
  });

  it("answers /v1/auth routes without any env switch", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/auth/.well-known/jwks.json" });
    expect(res.statusCode).not.toBe(404);
  });

  it.each([
    ["POST", "/v1/auth/signup"],
    ["POST", "/v1/auth/signin/password"],
    ["POST", "/v1/auth/refresh"],
    ["GET", "/v1/auth/me/security"],
  ])("%s %s is routed (not a 404)", async (method, url) => {
    const res = await app.inject({ method: method as "GET" | "POST", url, payload: method === "POST" ? {} : undefined });
    expect(res.statusCode).not.toBe(404);
  });
});
