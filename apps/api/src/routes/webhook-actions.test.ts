import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  responseWebhookAction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  responseWebhookActionLog: {
    findMany: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { webhookActionsRouter } = await import("./webhook-actions.js");
  await app.register(webhookActionsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/webhook-actions", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns webhook actions for the org", async () => {
    mockPrisma.responseWebhookAction.findMany.mockResolvedValue([
      { id: "wa-1", title: "Payment Received", conditionKey: "event", conditionValue: "payment_received", isActive: true },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/webhook-actions" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/webhook-actions", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a webhook action and returns 201", async () => {
    const created = { id: "wa-2", organizationId: "org-1", title: "Order Shipped", conditionKey: "status", conditionValue: "shipped", templateId: "tmpl-1", isActive: true };
    mockPrisma.responseWebhookAction.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhook-actions",
      payload: { title: "Order Shipped", conditionKey: "status", conditionValue: "shipped", templateId: "tmpl-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("wa-2");
  });
});

describe("GET /v1/webhook-actions/:id/logs", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns execution logs for the action", async () => {
    mockPrisma.responseWebhookAction.findFirst.mockResolvedValue({ id: "wa-1", organizationId: "org-1" });
    mockPrisma.responseWebhookActionLog.findMany.mockResolvedValue([
      { id: "log-1", actionId: "wa-1", webhookLogId: "whl-1", messageId: "msg-1", createdAt: new Date() },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/webhook-actions/wa-1/logs" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
