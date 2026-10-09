import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as MetaTemplatesModule from "../../lib/meta-templates.js";

const submit = vi.fn();
const edit = vi.fn();
const del = vi.fn();
vi.mock("../../lib/meta-templates.js", async (orig) => {
  const real = await orig<typeof MetaTemplatesModule>();
  return {
    ...real,
    submitTemplateToMeta: (...a: unknown[]) => submit(...a),
    editTemplateOnMeta: (...a: unknown[]) => edit(...a),
    deleteTemplateOnMeta: (...a: unknown[]) => del(...a),
  };
});

const TOKEN = "SECRET_TOKEN_XYZ";
type Row = Record<string, unknown> & { id: string; organizationId: string; name: string; language: string; metaTemplateId: string | null };
let rows: Row[] = [];
let seq = 0;
let lockCalls = 0;
let chain: Promise<unknown> = Promise.resolve();

const matches = (r: Row, w: Record<string, unknown> = {}) => Object.entries(w).every(([k, v]) => {
  if (k === "name" && v && typeof v === "object") return r.name.toLowerCase().includes(String((v as { contains: string }).contains).toLowerCase());
  if (k === "metaTemplateId" && v && typeof v === "object") return r.metaTemplateId !== null;
  return r[k] === v;
});
const templateApi = {
  findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null),
  findMany: vi.fn(async ({ where, skip = 0, take }: { where: Record<string, unknown>; skip?: number; take?: number }) =>
    rows.filter((r) => matches(r, where)).slice(skip, take === undefined ? undefined : skip + take)),
  create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `t-${++seq}`, metaTemplateId: null, qualityScore: null, rejectedReason: null, ...data } as unknown as Row;
    rows.push(row);
    return row;
  }),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find((r) => r.id === where.id)!;
    Object.assign(row, data);
    return row;
  }),
  deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const before = rows.length;
    rows = rows.filter((r) => !matches(r, where));
    return { count: before - rows.length };
  }),
};
const mockPrisma = {
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  template: templateApi,
  // Serializes transactions like the advisory lock does in Postgres.
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
    const run = chain.then(() => fn({ template: templateApi, $executeRaw: async () => { lockCalls++; return 1; } }));
    chain = run.catch(() => undefined);
    return run;
  }),
};

const logLines: string[] = [];
async function buildApp(orgId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error", stream: { write: (l: string) => { logLines.push(l); } } } });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.publicApi = { apiKeyId: "k1", organizationId: orgId }; });
  const { publicApiTemplatesRouter } = await import("./templates.js");
  await app.register(publicApiTemplatesRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

const base = "/v1/Account/k1/WhatsApp/Template";
const goodBody = () => ({ name: "promo_one", language: "en_US", category: "MARKETING", components: [{ type: "BODY", text: "Hi {{1}}" }] });
const seed = (over: Partial<Row> = {}): Row => {
  const r = {
    id: `t-${++seq}`, organizationId: "org-1", name: "promo", language: "en_US", category: "marketing", status: "approved",
    metaTemplateId: "9001", components: [{ type: "BODY", text: "x" }], qualityScore: null, rejectedReason: null, ...over,
  } as Row;
  rows.push(r);
  return r;
};

describe("public API templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); rows = []; seq = 0; lockCalls = 0; chain = Promise.resolve(); logLines.length = 0;
    mockPrisma.organization.findUnique.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: TOKEN });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    submit.mockResolvedValue({ metaTemplateId: "555", status: "pending" });
    edit.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });
  const notFoundError = "Resource not found";

  describe("POST create", () => {
    it("submits to Meta, stores the row org-scoped, returns the Plivo shape", async () => {
      const res = await post(`${base}/waba-1/`, { ...goodBody(), allow_category_change: true });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        api_id: expect.any(String), status: "success", message: "template submitted to meta for review", template_id: "555",
        template_name: "promo_one", template_status: "PENDING", template_language: "en_US", template_category: "MARKETING",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ organizationId: "org-1", name: "promo_one", language: "en_US", category: "marketing", metaTemplateId: "555", status: "pending", bodyText: "Hi {{1}}", headerFormat: "NONE" });
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ wabaId: "waba-1", accessToken: TOKEN, name: "promo_one", allowCategoryChange: true, components: goodBody().components }));
      expect(lockCalls).toBe(1);
      expect(mockPrisma.organization.findUnique.mock.calls[0]![0].where).toEqual({ id: "org-1" });
    });

    it("works without the trailing slash", async () => {
      expect((await post(`${base}/waba-1`, goodBody())).statusCode).toBe(200);
    });

    it("falls back to the vendor-setting token; 400 when neither exists", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: null });
      mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "VS_TOKEN" });
      expect((await post(`${base}/waba-1/`, goodBody())).statusCode).toBe(200);
      expect(submit.mock.calls[0]![0].accessToken).toBe("VS_TOKEN");
      expect(mockPrisma.vendorSetting.findFirst.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", key: "whatsapp_access_token" });
      mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
      rows = []; submit.mockClear();
      const res = await post(`${base}/waba-1/`, { ...goodBody(), name: "other" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("WhatsApp is not connected");
      expect(submit).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it("404 (same body as an unknown template) for a foreign waba_id; nothing written or sent", async () => {
      const res = await post(`${base}/waba-OTHER/`, goodBody());
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ api_id: expect.any(String), error: notFoundError });
      expect(rows).toHaveLength(0);
      expect(submit).not.toHaveBeenCalled();
    });

    it("404 when the org has no WABA at all", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ whatsappBusinessAccountId: null, wabaAccessToken: TOKEN });
      expect((await post(`${base}/anything/`, goodBody())).statusCode).toBe(404);
    });

    it("400 on validation errors (no BODY, non-string text, 11 buttons) without touching Meta or the DB", async () => {
      const buttons = Array.from({ length: 11 }, () => ({ type: "QUICK_REPLY", text: "ok" }));
      for (const components of [[{ type: "HEADER", format: "TEXT", text: "h" }], [{ type: "BODY", text: 42 }], [{ type: "BODY", text: "x" }, { type: "BUTTONS", buttons }]]) {
        const res = await post(`${base}/waba-1/`, { ...goodBody(), components });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ api_id: expect.any(String), error: expect.any(String) });
      }
      expect(submit).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it("400 for a duplicate name+language; org-scoped check; nothing new created", async () => {
      seed({ name: "promo_one", language: "en_US", status: "pending", metaTemplateId: "1" });
      const res = await post(`${base}/waba-1/`, goodBody());
      expect(res.statusCode).toBe(400);
      expect(rows).toHaveLength(1);
      expect(submit).not.toHaveBeenCalled();
      expect(templateApi.findFirst.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", name: "promo_one", language: "en_US" });
    });

    it("allows the same name in another language, and the same name in another org", async () => {
      seed({ name: "promo_one", language: "fr", organizationId: "org-1" });
      seed({ name: "promo_one", language: "en_US", organizationId: "org-2" });
      expect((await post(`${base}/waba-1/`, goodBody())).statusCode).toBe(200);
    });

    it("two concurrent creates of the same name+language leave exactly one row", async () => {
      const [a, b] = await Promise.all([post(`${base}/waba-1/`, goodBody()), post(`${base}/waba-1/`, goodBody())]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 400]);
      expect(rows).toHaveLength(1);
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it("Meta rejection: 400 with Meta's code, no orphan row, no Meta text or token echoed", async () => {
      const { MetaTemplateError } = await import("../../lib/meta-templates.js");
      submit.mockRejectedValue(new MetaTemplateError(`Meta template submission failed (code 100) ${TOKEN}`, 100, 400));
      const res = await post(`${base}/waba-1/`, goodBody());
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Meta rejected the template (code 100)");
      expect(res.body).not.toContain(TOKEN);
      expect(rows).toHaveLength(0);
      expect(templateApi.deleteMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1" });
    });

    it("Meta outage (5xx / network) is a 502, no orphan row", async () => {
      const { MetaTemplateError } = await import("../../lib/meta-templates.js");
      submit.mockRejectedValue(new MetaTemplateError("Meta template submission failed: network error", null, 0));
      const res = await post(`${base}/waba-1/`, goodBody());
      expect(res.statusCode).toBe(502);
      expect(rows).toHaveLength(0);
    });

    it.each([401, 403, 429])("Meta auth/throttle failure (HTTP %i) is a 502, not the caller's template problem", async (status) => {
      const { MetaTemplateError } = await import("../../lib/meta-templates.js");
      submit.mockRejectedValue(new MetaTemplateError("Meta template submission failed (code 190)", 190, status));
      const res = await post(`${base}/waba-1/`, goodBody());
      expect(res.statusCode).toBe(502);
      expect(rows).toHaveLength(0);
    });

    it("an unexpected error is a 502, removes the row, and logs no secrets", async () => {
      submit.mockRejectedValue(new Error(`boom ${TOKEN} +14155552671`));
      const res = await post(`${base}/waba-1/`, goodBody());
      expect(res.statusCode).toBe(502);
      expect(rows).toHaveLength(0);
      expect(res.body).not.toContain(TOKEN);
      expect(logLines.join("")).not.toContain(TOKEN);
      expect(logLines.join("")).not.toContain("14155552671");
    });
  });

  describe("GET list", () => {
    it("lists only this org's Meta-submitted templates with Plivo shapes and meta paging", async () => {
      seed({ name: "a", metaTemplateId: "1" });
      seed({ name: "b", metaTemplateId: "2", status: "rejected" });
      seed({ name: "draft", metaTemplateId: null, status: "draft" });
      seed({ name: "foreign", organizationId: "org-2", metaTemplateId: "3" });
      const res = await app.inject({ method: "GET", url: `${base}/waba-1/` });
      expect(res.statusCode).toBe(200);
      const j = res.json();
      expect(j.status).toBe("success");
      expect(j.meta).toEqual({ limit: 20, offset: 0, next: null, previous: null });
      expect(j.objects.map((o: { name: string }) => o.name).sort()).toEqual(["a", "b"]);
      expect(j.objects[0]).toEqual({ template_id: expect.any(String), name: expect.any(String), language: "en_US", category: "MARKETING", status: expect.any(String) });
      expect(templateApi.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1" });
    });

    it("filters by template_name (substring) inside the org", async () => {
      seed({ name: "welcome_msg", metaTemplateId: "1" });
      seed({ name: "promo", metaTemplateId: "2" });
      const res = await app.inject({ method: "GET", url: `${base}/waba-1/?template_name=WELC` });
      expect(res.json().objects.map((o: { name: string }) => o.name)).toEqual(["welcome_msg"]);
    });

    it("pages with next/previous links and never exceeds the clamp", async () => {
      for (let i = 0; i < 25; i++) seed({ name: `t${i}`, metaTemplateId: String(100 + i) });
      const first = (await app.inject({ method: "GET", url: `${base}/waba-1/?limit=500` })).json();
      expect(first.meta.limit).toBe(20);
      expect(first.objects).toHaveLength(20);
      expect(first.meta.next).toContain("offset=20");
      expect(first.meta.previous).toBeNull();
      const second = (await app.inject({ method: "GET", url: `${base}/waba-1/?limit=20&offset=20` })).json();
      expect(second.objects).toHaveLength(5);
      expect(second.meta.next).toBeNull();
      expect(second.meta.previous).toContain("offset=0");
    });

    it.each(["limit=abc", "offset=-5", "limit=-1&offset=zzz", "limit=1e99", "offset=99999999999999"])("never 500s on ?%s", async (qs) => {
      const res = await app.inject({ method: "GET", url: `${base}/waba-1/?${qs}` });
      expect(res.statusCode).toBe(200);
    });

    it("404 for a foreign waba_id", async () => {
      seed({ metaTemplateId: "1" });
      const res = await app.inject({ method: "GET", url: `${base}/waba-OTHER/` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe(notFoundError);
    });
  });

  describe("GET retrieve", () => {
    it("returns the template by org + meta id", async () => {
      seed({ metaTemplateId: "9001", qualityScore: "GREEN" });
      const res = await app.inject({ method: "GET", url: `${base}/waba-1/9001/` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        api_id: expect.any(String), template_id: "9001", name: "promo", language: "en_US", category: "MARKETING", status: "APPROVED",
        quality_score: { score: "GREEN" }, rejected_reason: "NONE", components: [{ type: "BODY", text: "x" }],
      });
      expect(templateApi.findFirst.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", metaTemplateId: "9001" });
    });

    it("org B's template id is a 404 for org A, identical to an unknown id", async () => {
      seed({ organizationId: "org-2", metaTemplateId: "7777" });
      const foreign = await app.inject({ method: "GET", url: `${base}/waba-1/7777/` });
      const unknown = await app.inject({ method: "GET", url: `${base}/waba-1/123456/` });
      const foreignWaba = await app.inject({ method: "GET", url: `${base}/waba-OTHER/7777/` });
      for (const r of [foreign, unknown, foreignWaba]) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toMatchObject({ api_id: expect.any(String), error: notFoundError });
      }
    });
  });

  describe("POST update", () => {
    it.each(["pending", "disabled", "in_appeal", "flagged", "limit_exceeded", "pending_deletion", "archived"] as const)("a %s template cannot be edited (400, Meta not called)", async (status) => {
      seed({ status });
      const res = await post(`${base}/waba-1/9001/`, { name: "promo", language: "en_US", category: "marketing", components: [{ type: "BODY", text: "New {{1}}" }] });
      expect(res.statusCode).toBe(400);
      expect(edit).not.toHaveBeenCalled();
    });

    it("a paused template can be edited (Meta allows it)", async () => {
      seed({ status: "paused" });
      const res = await post(`${base}/waba-1/9001/`, { name: "promo", language: "en_US", category: "marketing", components: [{ type: "BODY", text: "New {{1}}" }] });
      expect(res.statusCode).toBe(200);
      expect(edit).toHaveBeenCalled();
    });

    const editBody = () => ({ name: "promo", language: "en_US", category: "marketing", components: [{ type: "BODY", text: "New {{1}}" }] });

    it("edits at Meta, updates components and goes back to PENDING", async () => {
      const row = seed({ status: "approved" });
      const res = await post(`${base}/waba-1/9001/`, editBody());
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "success", template_id: "9001", template_status: "PENDING", template_name: "promo" });
      expect(edit).toHaveBeenCalledWith(expect.objectContaining({ accessToken: TOKEN, metaTemplateId: "9001", components: editBody().components }));
      expect(row).toMatchObject({ status: "pending", bodyText: "New {{1}}", components: editBody().components });
      expect(row["lastEditedTime"]).toBeInstanceOf(Date);
    });

    it("allows a rejected template; 400 for pending", async () => {
      seed({ status: "rejected" });
      expect((await post(`${base}/waba-1/9001/`, editBody())).statusCode).toBe(200);
      rows[0]!.status = "pending";
      edit.mockClear();
      expect((await post(`${base}/waba-1/9001/`, editBody())).statusCode).toBe(400);
      expect(edit).not.toHaveBeenCalled();
    });

    it("a draft (no Meta id) is not addressable by template_id: 404 and nothing is called", async () => {
      seed({ status: "draft", metaTemplateId: null });
      const res = await post(`${base}/waba-1/null/`, editBody());
      expect(res.statusCode).toBe(404);
      expect(edit).not.toHaveBeenCalled();
    });

    it("400 when name, language or category differ from the stored ones", async () => {
      seed();
      for (const patch of [{ name: "other" }, { language: "fr" }, { category: "UTILITY" }]) {
        const res = await post(`${base}/waba-1/9001/`, { ...editBody(), ...patch });
        expect(res.statusCode).toBe(400);
      }
      expect(edit).not.toHaveBeenCalled();
    });

    it("accepts category in any case when it equals the stored one", async () => {
      seed();
      expect((await post(`${base}/waba-1/9001/`, { ...editBody(), category: "MARKETING" })).statusCode).toBe(200);
    });

    it("404 for another org's template or a foreign waba; nothing changed", async () => {
      const other = seed({ organizationId: "org-2", metaTemplateId: "7777", status: "approved" });
      expect((await post(`${base}/waba-1/7777/`, editBody())).statusCode).toBe(404);
      expect((await post(`${base}/waba-OTHER/7777/`, editBody())).statusCode).toBe(404);
      expect(edit).not.toHaveBeenCalled();
      expect(other.status).toBe("approved");
    });

    it("Meta refusal: 400 with the code, row untouched", async () => {
      const { MetaTemplateError } = await import("../../lib/meta-templates.js");
      const row = seed();
      edit.mockRejectedValue(new MetaTemplateError("x", 2388025, 400));
      const res = await post(`${base}/waba-1/9001/`, editBody());
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Meta rejected the template (code 2388025)");
      expect(row.status).toBe("approved");
      expect(row.components).toEqual([{ type: "BODY", text: "x" }]);
    });

    it("validates the body (400) before calling Meta", async () => {
      seed();
      expect((await post(`${base}/waba-1/9001/`, { ...editBody(), components: [] })).statusCode).toBe(400);
      expect(edit).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    const delUrl = (id = "9001", name = "promo", waba = "waba-1") => `${base}/${waba}/${id}/?name=${name}`;

    it("deletes at Meta first, then the local row; 204", async () => {
      seed();
      const res = await app.inject({ method: "DELETE", url: delUrl() });
      expect(res.statusCode).toBe(204);
      expect(del).toHaveBeenCalledWith({ wabaId: "waba-1", accessToken: TOKEN, name: "promo", metaTemplateId: "9001" });
      expect(rows).toHaveLength(0);
      expect(templateApi.deleteMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1" });
    });

    it("Meta refuses: 502, local row kept, no token or Meta text echoed", async () => {
      const { MetaTemplateError } = await import("../../lib/meta-templates.js");
      seed();
      del.mockRejectedValue(new MetaTemplateError(`failed ${TOKEN}`, 190, 400));
      const res = await app.inject({ method: "DELETE", url: delUrl() });
      expect(res.statusCode).toBe(502);
      expect(res.body).not.toContain(TOKEN);
      expect(rows).toHaveLength(1);
    });

    it("400 when ?name is missing or differs from the stored name; nothing deleted", async () => {
      seed();
      expect((await app.inject({ method: "DELETE", url: `${base}/waba-1/9001/` })).statusCode).toBe(400);
      expect((await app.inject({ method: "DELETE", url: delUrl("9001", "wrong") })).statusCode).toBe(400);
      expect(del).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });

    it("404 for org B's template or a foreign waba; nothing deleted", async () => {
      seed({ organizationId: "org-2", metaTemplateId: "7777" });
      expect((await app.inject({ method: "DELETE", url: delUrl("7777") })).statusCode).toBe(404);
      expect((await app.inject({ method: "DELETE", url: delUrl("7777", "promo", "waba-OTHER") })).statusCode).toBe(404);
      expect(del).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });

    it("400 when no token is configured (Meta not called, row kept)", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ whatsappBusinessAccountId: "waba-1", wabaAccessToken: null });
      seed();
      const res = await app.inject({ method: "DELETE", url: delUrl() });
      expect(res.statusCode).toBe(400);
      expect(del).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });
  });
});
