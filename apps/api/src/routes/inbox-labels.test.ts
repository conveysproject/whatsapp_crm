import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  inboxLabel: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  conversationLabel: { upsert: vi.fn(), deleteMany: vi.fn() },
  conversation: { findFirst: vi.fn() },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { inboxLabelsRouter } = await import("./inbox-labels.js");
  await app.register(inboxLabelsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/inbox-labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns label list with conversation counts", async () => {
    mockPrisma.inboxLabel.findMany.mockResolvedValue([
      { id: "lbl-1", name: "Billing", color: "#EF4444", _count: { conversationLabels: 3 } },
      { id: "lbl-2", name: "Refund",  color: "#3B82F6", _count: { conversationLabels: 1 } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/inbox-labels" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; name: string; color: string; count: number }> }>();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ id: "lbl-1", name: "Billing", color: "#EF4444", count: 3 });
  });
});

describe("PUT /v1/conversations/:id/label", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("assigns an existing label to a conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.inboxLabel.upsert.mockResolvedValue({ id: "lbl-1", name: "Billing", color: "#EF4444" });
    mockPrisma.conversationLabel.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "Billing" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ label: { id: string; name: string; color: string } }>();
    expect(body.label).toEqual({ id: "lbl-1", name: "Billing", color: "#EF4444" });
    expect(mockPrisma.inboxLabel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_name: { organizationId: "org-1", name: "Billing" } },
      })
    );
  });

  it("returns 404 when conversation not found", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/missing/label",
      payload: { name: "Billing" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when name is too long", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "A".repeat(23) },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when name contains special chars", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "Billing!" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /v1/conversations/:id/label", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("clears the label from a conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.conversationLabel.deleteMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/conv-1/label" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.conversationLabel.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
    });
  });

  it("returns 404 when conversation not found", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/missing/label" });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/inbox-labels/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes an inbox label", async () => {
    mockPrisma.inboxLabel.findFirst.mockResolvedValue({ id: "lbl-1" });
    mockPrisma.inboxLabel.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/inbox-labels/lbl-1" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when label not found", async () => {
    mockPrisma.inboxLabel.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/inbox-labels/missing" });
    expect(res.statusCode).toBe(404);
  });
});
