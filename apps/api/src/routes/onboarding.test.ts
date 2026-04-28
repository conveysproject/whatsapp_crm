import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  organization: { update: vi.fn(), findUnique: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { onboardingRouter } = await import("./onboarding.js");
  await app.register(onboardingRouter, { prefix: "/v1/onboarding" });
  return app;
}

describe("POST /v1/onboarding/waba-callback", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 when code is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/onboarding/waba-callback", payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /v1/onboarding/status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns onboarding state", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      wabaAccessToken: null, phoneNumberId: null, onboardingStep: null,
    });
    const res = await app.inject({ method: "GET", url: "/v1/onboarding/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ wabaConnected: boolean }>();
    expect(typeof body.wabaConnected).toBe("boolean");
  });
});
