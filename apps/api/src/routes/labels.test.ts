import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  label: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  contact: { findFirst: vi.fn() },
  contactLabel: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  message: { findFirst: vi.fn() },
  messageLabel: { createMany: vi.fn(), deleteMany: vi.fn() },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { labelsRouter } = await import("./labels.js");
  await app.register(labelsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns labels for the org", async () => {
    mockPrisma.label.findMany.mockResolvedValue([
      { id: "lbl-1", organizationId: "org-1", title: "VIP", textColor: "#fff", bgColor: "#6366f1", isActive: true },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/labels" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a label and returns 201", async () => {
    const created = { id: "lbl-2", organizationId: "org-1", title: "VIP", textColor: "#fff", bgColor: "#6366f1" };
    mockPrisma.label.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/labels",
      payload: { title: "VIP", textColor: "#fff", bgColor: "#6366f1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("lbl-2");
  });

  it("applies default colors when not provided", async () => {
    const created = { id: "lbl-3", organizationId: "org-1", title: "Hot Lead", textColor: "#ffffff", bgColor: "#6366f1" };
    mockPrisma.label.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/labels",
      payload: { title: "Hot Lead" },
    });
    expect(res.statusCode).toBe(201);
    const call = mockPrisma.label.create.mock.calls[0][0] as { data: { textColor: string; bgColor: string } };
    expect(call.data.textColor).toBe("#ffffff");
    expect(call.data.bgColor).toBe("#6366f1");
  });
});

describe("PATCH /v1/labels/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when label not found", async () => {
    mockPrisma.label.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/v1/labels/bad-id", payload: { title: "Updated" } });
    expect(res.statusCode).toBe(404);
  });

  it("updates label title", async () => {
    mockPrisma.label.findFirst.mockResolvedValue({ id: "lbl-1", organizationId: "org-1", title: "Old" });
    mockPrisma.label.update.mockResolvedValue({ id: "lbl-1", organizationId: "org-1", title: "New" });
    const res = await app.inject({ method: "PATCH", url: "/v1/labels/lbl-1", payload: { title: "New" } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("New");
  });
});

describe("DELETE /v1/labels/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when label not found", async () => {
    mockPrisma.label.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/labels/bad-id" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes label and returns 204", async () => {
    mockPrisma.label.findFirst.mockResolvedValue({ id: "lbl-1", organizationId: "org-1" });
    mockPrisma.label.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/labels/lbl-1" });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /v1/contacts/:id/labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when contact not found", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/contacts/bad-id/labels", payload: { labelIds: ["lbl-1"] } });
    expect(res.statusCode).toBe(404);
  });

  it("assigns valid labels to contact", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.label.findMany.mockResolvedValue([{ id: "lbl-1" }]);
    mockPrisma.contactLabel.createMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "POST", url: "/v1/contacts/c-1/labels", payload: { labelIds: ["lbl-1"] } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ success: boolean }>().success).toBe(true);
  });
});

describe("DELETE /v1/contacts/:id/labels/:labelId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when contact not found", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/bad-id/labels/lbl-1" });
    expect(res.statusCode).toBe(404);
  });

  it("unassigns label and returns 204", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contactLabel.deleteMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-1/labels/lbl-1" });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /v1/messages/:id/labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when message not found", async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/messages/bad-id/labels", payload: { labelIds: ["lbl-1"] } });
    expect(res.statusCode).toBe(404);
  });

  it("assigns label to message", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: "msg-1", organizationId: "org-1" });
    mockPrisma.label.findMany.mockResolvedValue([{ id: "lbl-1" }]);
    mockPrisma.messageLabel.createMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "POST", url: "/v1/messages/msg-1/labels", payload: { labelIds: ["lbl-1"] } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ success: boolean }>().success).toBe(true);
  });
});
