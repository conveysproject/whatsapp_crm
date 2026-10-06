import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as MetaTemplatesModule from "../lib/meta-templates.js";

const mockPrisma = {
  template: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  message: { groupBy: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  organization: { findUnique: vi.fn(), findFirst: vi.fn() },
};
const deleteOnMeta = vi.fn();
vi.mock("../lib/meta-templates.js", async (orig) => {
  const real = await orig<typeof MetaTemplatesModule>();
  return { ...real, deleteTemplateOnMeta: (...a: unknown[]) => deleteOnMeta(...a) };
});
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

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

describe("templates section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { templatesRouter } = await import("./templates.js");
    await app.register(templatesRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks templates_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no templates_access
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.template.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has templates_access", async () => {
    mockPrisma.template.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ templates_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.template.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("blocks template create when templates_create sub is off (parent on)", async () => {
    const app = await buildAppAs({ templates_access: "allow" }); // create sub off
    const res = await app.inject({ method: "POST", url: "/v1/templates", payload: { name: "T", category: "MARKETING", language: "en", components: [] } });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.template.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks template delete when templates_delete sub is off (parent on)", async () => {
    const app = await buildAppAs({ templates_access: "allow" }); // delete sub off
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("DELETE /v1/templates/:id (shared Meta delete)", () => {
  let app: FastifyInstance;
  const tpl = { id: "t-1", organizationId: "org-1", name: "promo", metaTemplateId: "9001" };
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.template.findFirst.mockResolvedValue(tpl);
    mockPrisma.template.delete.mockResolvedValue(tpl);
    mockPrisma.organization.findFirst.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: "ORG_TOKEN" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    deleteOnMeta.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("deletes at Meta with the documented call (waba + name + id), then locally; org-scoped", async () => {
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(204);
    expect(deleteOnMeta).toHaveBeenCalledWith({ wabaId: "waba-1", accessToken: "ORG_TOKEN", name: "promo", metaTemplateId: "9001" });
    expect(mockPrisma.template.findFirst.mock.calls[0]![0].where).toEqual({ id: "t-1", organizationId: "org-1" });
    expect(mockPrisma.template.delete).toHaveBeenCalledWith({ where: { id: "t-1" } });
  });

  it("prefers the vendor-setting token (as the submit route does)", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "VS_TOKEN" });
    await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(deleteOnMeta.mock.calls[0]![0].accessToken).toBe("VS_TOKEN");
  });

  it("Meta failure: 502 and the row is kept (no orphan at Meta)", async () => {
    const { MetaTemplateError } = await import("../lib/meta-templates.js");
    deleteOnMeta.mockRejectedValue(new MetaTemplateError("x", 190, 400));
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(502);
    expect(mockPrisma.template.delete).not.toHaveBeenCalled();
  });

  it("no Meta id: deletes locally without calling Meta", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({ ...tpl, metaTemplateId: null });
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(204);
    expect(deleteOnMeta).not.toHaveBeenCalled();
    expect(mockPrisma.template.delete).toHaveBeenCalled();
  });

  it("Meta says the template is already gone (helper resolves): deletes locally", async () => {
    deleteOnMeta.mockResolvedValue(undefined);
    expect((await app.inject({ method: "DELETE", url: "/v1/templates/t-1" })).statusCode).toBe(204);
    expect(mockPrisma.template.delete).toHaveBeenCalled();
  });

  it("org has no WABA (disconnected): nothing to delete at Meta, the local row is removed", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ whatsappBusinessAccountId: null, wabaAccessToken: null });
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(204);
    expect(deleteOnMeta).not.toHaveBeenCalled();
    expect(mockPrisma.template.delete).toHaveBeenCalled();
  });

  it("WABA present but no token anywhere: 400 and the row is kept", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: null });
    const res = await app.inject({ method: "DELETE", url: "/v1/templates/t-1" });
    expect(res.statusCode).toBe(400);
    expect(deleteOnMeta).not.toHaveBeenCalled();
    expect(mockPrisma.template.delete).not.toHaveBeenCalled();
  });

  it("404 for another org's template: nothing called", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);
    expect((await app.inject({ method: "DELETE", url: "/v1/templates/t-9" })).statusCode).toBe(404);
    expect(deleteOnMeta).not.toHaveBeenCalled();
    expect(mockPrisma.template.delete).not.toHaveBeenCalled();
  });
});
