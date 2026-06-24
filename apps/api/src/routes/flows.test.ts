import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn() },
  campaignQueue: { add: vi.fn() },
  flowQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const mockPrisma = {
  flow: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  flowRun: {
    findMany: vi.fn(),
  },
  vendorSetting: { findFirst: vi.fn().mockResolvedValue(null) },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

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

describe("POST /v1/flows/:id/duplicate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when flow not found", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/flows/missing/duplicate" });
    expect(res.statusCode).toBe(404);
  });

  it("creates a copy with name prefixed and isActive false", async () => {
    const original = {
      id: "flow-1",
      organizationId: "org-1",
      name: "My Flow",
      triggerType: "new_conversation",
      isActive: true,
      flowDefinition: { startNodeId: "n1", nodes: [] },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const copy = { ...original, id: "flow-2", name: "Copy of My Flow", isActive: false };
    mockPrisma.flow.findFirst.mockResolvedValue(original);
    mockPrisma.flow.create.mockResolvedValue(copy);

    const res = await app.inject({ method: "POST", url: "/v1/flows/flow-1/duplicate" });

    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { name: string; isActive: boolean } }>().data.name).toBe("Copy of My Flow");
    expect(res.json<{ data: { name: string; isActive: boolean } }>().data.isActive).toBe(false);
  });
});

describe("GET /v1/flows/:id/runs", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when flow not found", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/flows/missing/runs" });
    expect(res.statusCode).toBe(404);
  });

  it("returns paginated run list", async () => {
    mockPrisma.flow.findFirst.mockResolvedValue({ id: "flow-1" });
    mockPrisma.flowRun.findMany.mockResolvedValue([
      {
        id: "run-1",
        flowId: "flow-1",
        organizationId: "org-1",
        contactPhone: "919900000001",
        conversationId: "conv-1",
        status: "completed",
        stepsExecuted: 3,
        error: null,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ]);

    const res = await app.inject({ method: "GET", url: "/v1/flows/flow-1/runs" });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("automation section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions };
    });
    const { flowsRouter } = await import("./flows.js");
    await app.register(flowsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks automation_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no automation_access
    const res = await app.inject({ method: "GET", url: "/v1/flows" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.flow.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has automation_access", async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ automation_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/flows" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/flows" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("blocks flow create when automation_bot_flows sub is off (parent on)", async () => {
    const app = await buildAppAs({ automation_access: "allow" }); // bot_flows sub off
    const res = await app.inject({ method: "POST", url: "/v1/flows", payload: { name: "F", triggerType: "keyword", flowDefinition: { steps: [] } } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.flow.create).not.toHaveBeenCalled();
    await app.close();
  });
});
