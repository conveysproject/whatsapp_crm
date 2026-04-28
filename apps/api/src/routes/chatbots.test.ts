import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  chatbot: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { chatbotsRouter } = await import("./chatbots.js");
  await app.register(chatbotsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/chatbots", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates chatbot with isActive: false", async () => {
    mockPrisma.chatbot.create.mockResolvedValue({
      id: "bot-1", name: "Welcome Bot", flowId: "flow-1", isActive: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/chatbots",
      payload: { name: "Welcome Bot", flowId: "flow-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { isActive: boolean } }>().data.isActive).toBe(false);
  });
});
