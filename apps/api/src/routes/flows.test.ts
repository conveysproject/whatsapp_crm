import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn() },
  campaignQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const mockPrisma = {
  flow: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { flowsRouter } = await import("./flows.js");
  await app.register(flowsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/flows", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a flow with isActive: false by default", async () => {
    mockPrisma.flow.create.mockResolvedValue({
      id: "flow-1", name: "Welcome Flow", triggerType: "inbound_message", isActive: false,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/flows",
      payload: {
        name: "Welcome Flow",
        triggerType: "inbound_message",
        flowDefinition: { nodes: [] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { isActive: boolean } }>().data.isActive).toBe(false);
  });
});
