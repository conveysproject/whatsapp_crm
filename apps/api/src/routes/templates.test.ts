import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as MetaTemplatesModule from "../lib/meta-templates.js";
import type * as TemplateAnalyticsModule from "../lib/template-analytics.js";

const mockPrisma = {
  template: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  message: { groupBy: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  organization: { findUnique: vi.fn(), findFirst: vi.fn() },
};
const deleteOnMeta = vi.fn();
vi.mock("../lib/meta-templates.js", async (orig) => {
  const real = await orig<typeof MetaTemplatesModule>();
  return { ...real, deleteTemplateOnMeta: (...a: unknown[]) => deleteOnMeta(...a) };
});
const getAnalytics = vi.fn();
vi.mock("../lib/template-analytics.js", async (orig) => {
  const real = await orig<typeof TemplateAnalyticsModule>();
  return { ...real, getTemplateAnalytics: (...a: unknown[]) => getAnalytics(...a) };
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

  const tpl = {
    id: "t-1",
    organizationId: "org-1",
    name: "Welcome",
    language: "en",
    category: "marketing",
    status: "approved",
    qualityScore: "GREEN",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    lastEditedTime: new Date("2026-09-01T10:00:00.000Z"),
    bodyText: "Hello {{1}}",
  };
  const analytics = (over: Partial<{ sent: number; delivered: number; read: number; failed: number }> = {}) => ({
    inProgress: 2,
    sent: 100,
    delivered: 80,
    read: 40,
    failed: 5,
    rates: { delivery: 80, read: 50, failure: 4.8 },
    reach: { uniqueRecipients: 90, lastSentAt: "2026-10-09T08:00:00.000Z" },
    daily: [{ day: "2026-10-09", sent: 10, delivered: 8, read: 4, failed: 1 }],
    failures: [],
    sources: [{ source: "campaign", count: 100 }],
    template: {
      name: "Welcome", language: "en", category: "marketing", status: "approved",
      qualityScore: "GREEN", lastEditedAt: "2026-09-01T10:00:00.000Z", previewText: "Hello {{1}}",
    },
    range: "7d",
    ...over,
  });
  type Body = {
    data: {
      sent: number; delivered: number; read: number; failed: number; readPercentage: number;
      template: Record<string, unknown>; range: string; attributionNote: string | null;
      inProgress: number; rates: unknown; daily: unknown[];
    };
  };
  const get = (url = "/v1/templates/t-1/analytics") => app.inject({ method: "GET", url });
  const setup = (over: Parameters<typeof analytics>[0] = {}, unlinked: unknown = null) => {
    mockPrisma.template.findFirst.mockResolvedValue(tpl);
    mockPrisma.message.findFirst.mockResolvedValue(unlinked);
    getAnalytics.mockResolvedValue(analytics(over));
  };

  it("returns 404 for a template of another org and scopes the lookup by organizationId", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);
    const res = await get("/v1/templates/other-org-id/analytics");
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NOT_FOUND");
    expect(mockPrisma.template.findFirst).toHaveBeenCalledWith({ where: { id: "other-org-id", organizationId: "org-1" } });
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_RANGE for an unknown range", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(tpl);
    const res = await get("/v1/templates/t-1/analytics?range=bogus");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "INVALID_RANGE", message: "range must be 7d, 30d, 90d or all" } });
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("returns the full shape for range=7d and calls the lib with org, template and range", async () => {
    setup();
    const res = await get("/v1/templates/t-1/analytics?range=7d");
    expect(res.statusCode).toBe(200);
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    const args = getAnalytics.mock.calls[0]?.[1] as { organizationId: string; template: Record<string, unknown>; range: string };
    expect(args.organizationId).toBe("org-1");
    expect(args.template).toMatchObject({ id: "t-1", name: "Welcome", language: "en", category: "marketing", status: "approved", qualityScore: "GREEN" });
    expect(args.range).toBe("7d");
    const { data } = res.json<Body>();
    expect(data.inProgress).toBe(2);
    expect(data.rates).toEqual({ delivery: 80, read: 50, failure: 4.8 });
    expect(data.daily).toHaveLength(1);
    expect(data.range).toBe("7d");
    expect(data.template).toEqual({
      name: "Welcome", language: "en", category: "marketing", status: "approved",
      qualityScore: "GREEN", lastEditedAt: "2026-09-01T10:00:00.000Z", previewText: "Hello {{1}}",
    });
  });

  it("defaults to 30d when range is absent", async () => {
    setup();
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect((getAnalytics.mock.calls[0]?.[1] as { range: string }).range).toBe("30d");
  });

  it("includes legacy keys consistent with the cumulative numbers", async () => {
    setup();
    const { data } = (await get()).json<Body>();
    expect(data.sent).toBe(100);
    expect(data.delivered).toBe(80);
    expect(data.read).toBe(40);
    expect(data.failed).toBe(5);
    expect(data.readPercentage).toBe(50);
  });

  it("computes readPercentage as 0 when delivered is 0", async () => {
    setup({ sent: 3, delivered: 0, read: 0, failed: 3 });
    const { data } = (await get()).json<Body>();
    expect(data.readPercentage).toBe(0);
  });

  it("rounds readPercentage and caps it at 100", async () => {
    setup({ delivered: 3, read: 1 });
    expect((await get()).json<Body>().data.readPercentage).toBe(33);
    setup({ delivered: 2, read: 5 });
    expect((await get()).json<Body>().data.readPercentage).toBe(100);
  });

  it("sets attributionNote when the org has unlinked outbound template messages", async () => {
    setup({}, { id: "m-1" });
    const { data } = (await get()).json<Body>();
    expect(data.attributionNote).toBe("Messages sent before this feature was introduced may not be included.");
    expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1", direction: "outbound", contentType: "template", templateId: null,
        sentAt: { gte: new Date("2026-08-01T10:00:00.000Z") },
      },
      select: { id: true },
    });
  });

  it("rejects repeated, empty and wrong-case range values with 400 INVALID_RANGE", async () => {
    mockPrisma.template.findFirst.mockResolvedValue(tpl);
    for (const q of ["range=7d&range=30d", "range=", "range=7D"]) {
      const res = await get(`/v1/templates/t-1/analytics?${q}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_RANGE");
    }
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the thrown error when analytics fails", async () => {
    setup();
    getAnalytics.mockRejectedValue(new Error("secret db detail postgres://u:p@h"));
    const res = await get();
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret db detail");
    expect(res.body).not.toContain("postgres://");
    expect(res.body).not.toMatch(/stack|at .*\.ts/);
  });

  it("leaves attributionNote null when there are no unlinked template messages", async () => {
    setup();
    const { data } = (await get()).json<Body>();
    expect(data.attributionNote).toBeNull();
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

  it("records the template id and source=test on the created message", async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: "t-1", organizationId: "org-1", name: "Welcome", status: "approved", metaTemplateId: "meta-t-1", language: "en_US",
    });
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1", phoneNumber: "+919999999999", firstName: "Alice" });
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "phone-1", wabaAccessToken: "token-1" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", contactId: "c-1" });
    mockPrisma.message.create.mockResolvedValue({ id: "msg-1" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/t-1/send-to-contact",
      payload: { contactId: "c-1", variables: [] },
    });
    expect(res.statusCode).toBe(200);
    const data = (mockPrisma.message.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ contentType: "template", organizationId: "org-1", templateId: "t-1", source: "test" });
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

  it("returns 403 on the analytics route when the role lacks templates_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/templates/t-1/analytics" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.template.findFirst).not.toHaveBeenCalled();
    expect(getAnalytics).not.toHaveBeenCalled();
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

describe("POST /v1/templates/sync: Meta statuses", () => {
  let app: FastifyInstance;
  const realFetch = globalThis.fetch;
  const syncWith = async (metaStatus: string, existing: { id: string; status: string } | null) => {
    mockPrisma.organization.findFirst.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: "tok" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    mockPrisma.template.findFirst.mockResolvedValue(existing);
    mockPrisma.template.create.mockResolvedValue({});
    mockPrisma.template.update.mockResolvedValue({});
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "9", name: "promo", status: metaStatus, category: "UTILITY", language: "en", components: [{ type: "BODY", text: "Hi" }] }] }) }) as unknown as typeof fetch;
    return app.inject({ method: "POST", url: "/v1/templates/sync" });
  };
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { globalThis.fetch = realFetch; await app.close(); });

  it.each([["PAUSED", "paused"], ["DISABLED", "disabled"], ["IN_APPEAL", "in_appeal"], ["FLAGGED", "flagged"], ["LIMIT_EXCEEDED", "limit_exceeded"]])(
    "stores Meta %s as %s (it used to be inserted verbatim and could fail the whole sync)", async (meta, ours) => {
      const res = await syncWith(meta, null);
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.template.create.mock.calls[0]![0].data.status).toBe(ours);
    });

  it("an unknown Meta status keeps an existing row's status and starts a new row as pending", async () => {
    await syncWith("SOMETHING_NEW", { id: "t-1", status: "approved" });
    expect(mockPrisma.template.update.mock.calls[0]![0].data.status).toBe("approved");
    await syncWith("SOMETHING_NEW", null);
    expect(mockPrisma.template.create.mock.calls[0]![0].data.status).toBe("pending");
  });
});
