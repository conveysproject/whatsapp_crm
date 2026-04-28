import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

vi.mock("../lib/clerk.js", () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: "user_123",
    organizationId: "org_123",
  }),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue({ role: "admin" }),
    },
    $disconnect: vi.fn(),
  },
}));

describe("auth plugin", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    const prismaPlugin = (await import("./prisma.js")).default;
    const authPlugin = (await import("./auth.js")).default;
    await app.register(prismaPlugin);
    await app.register(authPlugin);
    app.get("/protected", async (req) => ({ userId: req.auth.userId }));
    app.get("/public", { config: { public: true } }, async () => ({ ok: true }));
    await app.ready();
  });

  afterAll(() => app.close());

  it("sets request.auth on valid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer valid" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { userId: string }).userId).toBe("user_123");
  });

  it("skips auth for public routes", async () => {
    const res = await app.inject({ method: "GET", url: "/public" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when token is missing", async () => {
    const { verifyClerkToken } = await import("../lib/clerk.js");
    vi.mocked(verifyClerkToken).mockRejectedValueOnce(new Error("Missing Authorization header"));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });
});
