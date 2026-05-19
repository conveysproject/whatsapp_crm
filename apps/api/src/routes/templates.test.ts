import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  template: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { groupBy: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  organization: { findUnique: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

vi.mock("../lib/whatsapp.js", () => ({
  sendTemplateMessage: vi.fn().mockResolvedValue({ messageId: "wamid-tpl-1" }),
}));

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { templatesRouter } = await import("./templates.js");
  await app.register(templatesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns templates for org", async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      { id: "t-1", organizationId: "org-1", name: "Welcome", status: "pending" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates template with status pending", async () => {
    const created = { id: "t-2", organizationId: "org-1", name: "Promo", status: "pending" };
    mockPrisma.template.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates",
      payload: { name: "Promo", category: "marketing", language: "en", components: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("pending");
  });
});

describe("GET /v1/templates/:id/analytics", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns delivery stats for the template", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "t-1",
      organizationId: "org-1",
      name: "Welcome",
      status: "approved",
    });
    mockPrisma.message.groupBy.mockResolvedValue([
      { status: "delivered", _count: { status: 40 } },
      { status: "read", _count: { status: 10 } },
      { status: "failed", _count: { status: 5 } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/templates/t-1/analytics" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { delivered: number; read: number; failed: number } }>();
    expect(body.data.delivered).toBe(40);
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/templates/bad-id/analytics" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /v1/templates/:id/send-to-contact", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a message record and returns 200", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "t-1",
      organizationId: "org-1",
      name: "Welcome",
      status: "approved",
      metaTemplateId: "meta-t-1",
      language: "en_US",
    });
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "c-1",
      organizationId: "org-1",
      phoneNumber: "+919999999999",
      firstName: "Alice",
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      phoneNumberId: "phone-1",
      wabaAccessToken: "token-1",
    });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: "conv-1",
      organizationId: "org-1",
      contactId: "c-1",
    });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg-1",
      conversationId: "conv-1",
      organizationId: "org-1",
      direction: "outbound",
      status: "sent",
      body: "Welcome",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/t-1/send-to-contact",
      payload: { contactId: "c-1", variables: [] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { message: { id: string } } }>();
    expect(body.data.message.id).toBe("msg-1");
  });

  it("returns 404 when template not found", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/bad-id/send-to-contact",
      payload: { contactId: "c-1", variables: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when contact not found", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "t-1",
      organizationId: "org-1",
      name: "Welcome",
      status: "approved",
      metaTemplateId: "meta-t-1",
      language: "en_US",
    });
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/t-1/send-to-contact",
      payload: { contactId: "bad-c", variables: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("creates a new conversation when none exists", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "t-1",
      organizationId: "org-1",
      name: "Welcome",
      status: "approved",
      metaTemplateId: "meta-t-1",
      language: "en_US",
    });
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "c-2",
      organizationId: "org-1",
      phoneNumber: "+919999999998",
      firstName: "Bob",
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      phoneNumberId: "phone-1",
      wabaAccessToken: "token-1",
    });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({
      id: "conv-new",
      organizationId: "org-1",
      contactId: "c-2",
    });
    mockPrisma.message.create.mockResolvedValue({
      id: "msg-2",
      conversationId: "conv-new",
      organizationId: "org-1",
      direction: "outbound",
      status: "sent",
      body: "Welcome",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/t-1/send-to-contact",
      payload: { contactId: "c-2", variables: [] },
    });
    expect(res.statusCode).toBe(200);
  });
});
