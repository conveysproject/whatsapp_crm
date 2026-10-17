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

describe("auth module gate", () => {
  let app: FastifyInstance;
  const saved = process.env.AUTH_PROVIDER;
  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.AUTH_PROVIDER;
    app = Fastify({ logger: false });
    app.decorate("prisma", prisma as any);
    await app.register(authRouter, { prefix: "/v1/auth" });
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.AUTH_PROVIDER;
    else process.env.AUTH_PROVIDER = saved;
  });

  it.each([
    ["POST", "/v1/auth/signup"],
    ["POST", "/v1/auth/signin/password"],
    ["POST", "/v1/auth/refresh"],
    ["GET", "/v1/auth/.well-known/jwks.json"],
    ["GET", "/v1/auth/me/security"],
  ])("%s %s answers 404 in clerk mode with no side effects", async (method, url) => {
    const res = await app.inject({ method: method as "GET" | "POST", url, payload: method === "POST" ? {} : undefined });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
    for (const model of Object.values(prisma)) for (const fn of Object.values(model)) expect(fn).not.toHaveBeenCalled();
    expect(m.hitLimit).not.toHaveBeenCalled();
    expect(m.issueCode).not.toHaveBeenCalled();
    expect(m.sendCodeEmail).not.toHaveBeenCalled();
  });

  it("answers 404 for AUTH_PROVIDER=clerk too", async () => {
    process.env.AUTH_PROVIDER = "clerk";
    const res = await app.inject({ method: "GET", url: "/v1/auth/.well-known/jwks.json" });
    expect(res.statusCode).toBe(404);
  });
});
