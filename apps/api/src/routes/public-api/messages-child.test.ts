import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const sendAdd = vi.fn();
const enqueueCb = vi.fn();
const childRate = vi.fn();
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: (...a: unknown[]) => sendAdd(...a) }, publicApiCallbackQueue: { add: vi.fn() } }));
vi.mock("../../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a), businessNumberDigits: async () => "" }));
vi.mock("../../lib/public-api/child-rate-limit.js", () => ({ checkChildSendRate: (...a: unknown[]) => childRate(...a) }));

const mockPrisma = {
  organization: { findUnique: vi.fn(), findMany: vi.fn() },
  vendorSetting: { findFirst: vi.fn(), findMany: vi.fn() },
  template: { findMany: vi.fn() },
  contact: { upsert: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn(), update: vi.fn() },
  apiMessageMeta: { create: vi.fn() },
};

let keyScopes: string[] = [];
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.publicApi = { apiKeyId: "k1", organizationId: "org-1", scopes: keyScopes }; });
  const { publicApiMessagesRouter } = await import("./messages.js");
  await app.register(publicApiMessagesRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

const body = { src: "+14155552671", dst: "+14155552672", type: "whatsapp", text: "hello" };
const childBody = { ...body, src: "+14155551111" };
const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: "POST", url: "/v1/Account/k1/Message/", payload: payload as object });

type Row = { id: string; parentOrganizationId: string | null; isParent: boolean; status: string; phoneNumberId: string | null; wabaAccessToken: string | null; whatsappBusinessAccountId: string | null; number: string };
const row = (id: string, over: Partial<Row> = {}): Row => ({ id, parentOrganizationId: null, isParent: false, status: "active", phoneNumberId: `pn-${id}`, wabaAccessToken: `TOKEN_${id}`, whatsappBusinessAccountId: `waba-${id}`, number: "", ...over });

describe("POST /Message/ with a parent key sending for a child", () => {
  let app: FastifyInstance;
  let n = 0;
  let table: Row[];
  let blocked: Set<string>;
  const ORIG = process.env["PARENT_ORGS_ENABLED"];

  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); n = 0;
    process.env["PARENT_ORGS_ENABLED"] = "true";
    keyScopes = ["whatsapp", "send_for_children"];
    childRate.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    blocked = new Set();
    table = [
      row("org-1", { isParent: true, number: "+1 415-555-2671" }),
      row("child-1", { parentOrganizationId: "org-1", number: "+1 415-555-1111" }),
      row("other-parent", { isParent: true, number: "+1 415-555-0002" }),
      row("other-child", { parentOrganizationId: "other-parent", number: "+1 415-555-3333" }),
    ];
    mockPrisma.organization.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => table.find((o) => o.id === where.id) ?? null);
    mockPrisma.organization.findMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] }; parentOrganizationId?: string } }) =>
      table.filter((o) => (!where.id || where.id.in.includes(o.id)) && (where.parentOrganizationId === undefined || o.parentOrganizationId === where.parentOrganizationId)));
    mockPrisma.vendorSetting.findFirst.mockImplementation(async ({ where }: { where: { organizationId: string; key?: string } }) => {
      if (where.key === "plan_feature_public_api_blocked") return blocked.has(where.organizationId) ? { value: "true" } : null;
      const o = table.find((x) => x.id === where.organizationId);
      return o?.number ? { value: o.number } : null;
    });
    mockPrisma.vendorSetting.findMany.mockImplementation(async ({ where }: { where: { organizationId: { in: string[] } } }) =>
      table.filter((o) => where.organizationId.in.includes(o.id) && o.number).map((o) => ({ organizationId: o.id, value: o.number })));
    mockPrisma.contact.upsert.mockResolvedValue({ id: "c1" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockImplementation(async () => ({ id: `msg-${++n}` }));
    mockPrisma.apiMessageMeta.create.mockResolvedValue({});
    mockPrisma.template.findMany.mockResolvedValue([]);
    enqueueCb.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
    if (ORIG === undefined) delete process.env["PARENT_ORGS_ENABLED"]; else process.env["PARENT_ORGS_ENABLED"] = ORIG;
  });

  it("sends for the child: every row is in the child org, meta records key + child + parent, no token in the queue", async () => {
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(202);
    expect(mockPrisma.contact.upsert.mock.calls[0]![0].where).toEqual({ organizationId_phoneNumber: { organizationId: "child-1", phoneNumber: "14155552672" } });
    expect(mockPrisma.conversation.findFirst.mock.calls[0]![0].where).toMatchObject({ organizationId: "child-1" });
    expect(mockPrisma.message.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "child-1" });
    expect(mockPrisma.apiMessageMeta.create.mock.calls[0]![0].data).toMatchObject({ apiKeyId: "k1", organizationId: "child-1", parentOrganizationId: "org-1" });
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ messageId: "msg-1", organizationId: "child-1", viaParentOrgId: "org-1" });
    expect(JSON.stringify(sendAdd.mock.calls)).not.toMatch(/TOKEN_/);
    expect(childRate).toHaveBeenCalledWith("k1", "child-1", 1);
  });

  it("template lookup uses the child org", async () => {
    await post(app, { ...childBody, text: undefined, template: { name: "welcome", language: "en_US" } });
    expect(mockPrisma.template.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "child-1", name: "welcome" });
  });

  it("the parent's own number still sends in the parent org with parentOrganizationId null", async () => {
    const res = await post(app, body);
    expect(res.statusCode).toBe(202);
    expect(mockPrisma.message.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1" });
    expect(mockPrisma.apiMessageMeta.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1", parentOrganizationId: null });
    expect(sendAdd.mock.calls[0]![1].viaParentOrgId).toBeUndefined();
    expect(childRate).not.toHaveBeenCalled();
  });

  it("the parent's own token is never selected when sending for a child", async () => {
    await post(app, childBody);
    const tokenReads = mockPrisma.organization.findUnique.mock.calls
      .filter((c) => (c[0] as { select?: { wabaAccessToken?: boolean } }).select?.wabaAccessToken)
      .map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(tokenReads).toEqual(["child-1"]);
  });

  it("unknown, unlinked and someone else's child give the identical 403 and write nothing", async () => {
    const other = await post(app, { ...body, src: "+14155553333" });
    const unknown = await post(app, { ...body, src: "+14155559999" });
    expect(other.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    const strip = (r: { json: () => Record<string, unknown> }) => ({ ...r.json(), api_id: "x" });
    expect(strip(other)).toEqual(strip(unknown));
    expect(other.json()).toMatchObject({ error_code: "FORBIDDEN_CHILD" });
    expect(other.body).not.toMatch(/3333|other/i);
    table.find((o) => o.id === "child-1")!.parentOrganizationId = null; // unlink
    const unlinked = await post(app, childBody);
    expect(unlinked.statusCode).toBe(403);
    expect(strip(unlinked)).toEqual(strip(unknown));
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("a key without the scope sending a child's src gets the OLD 400 SRC_MISMATCH, not a 403", async () => {
    keyScopes = ["whatsapp"];
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "SRC_MISMATCH" });
    expect(res.body).not.toContain("send_for_children");
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("flag off: same old 400 SRC_MISMATCH even with the scope", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "SRC_MISMATCH" });
  });

  it("a linked child that is not connected answers 400 WHATSAPP_NOT_CONNECTED, never falling back to the parent", async () => {
    table.find((o) => o.id === "child-1")!.wabaAccessToken = null;
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "WHATSAPP_NOT_CONNECTED" });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("a malformed waba_id and a mismatching waba_id is the generic 403; a matching one sends", async () => {
    expect((await post(app, { ...childBody, waba_id: 123 })).statusCode).toBe(403);
    expect((await post(app, { ...childBody, waba_id: "waba-other-child" })).statusCode).toBe(403);
    expect((await post(app, { ...childBody, waba_id: "waba-child-1" })).statusCode).toBe(202);
  });

  it("429 with Retry-After when the per-(key, child) limit is hit, nothing written", async () => {
    childRate.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("17");
    expect(res.json()).toMatchObject({ error_code: "RATE_LIMITED" });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("a key without the scope ignores a malformed waba_id (still 202 on its own number)", async () => {
    keyScopes = ["whatsapp"];
    expect((await post(app, { ...body, waba_id: 123 })).statusCode).toBe(202);
    expect((await post(app, { ...body, waba_id: "x".repeat(100) })).statusCode).toBe(202);
  });

  it("an entitled key with a malformed waba_id gets the generic 403", async () => {
    const res = await post(app, { ...childBody, waba_id: 123 });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error_code: "FORBIDDEN_CHILD" });
    expect((await post(app, { ...childBody, waba_id: "x".repeat(100) })).statusCode).toBe(403);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("a child blocked from the public API cannot be sent for: generic 403, nothing written", async () => {
    blocked.add("child-1");
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error_code: "FORBIDDEN_CHILD" });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("the limiter is charged per message, not per request", async () => {
    const dsts = Array.from({ length: 20 }, (_, i) => `+1415555${String(3000 + i)}`).join("<");
    await post(app, { ...childBody, dst: dsts });
    expect(childRate).toHaveBeenCalledWith("k1", "child-1", 20);
  });

  it("the job carries the key id so the worker can re-check the key", async () => {
    await post(app, childBody);
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ apiKeyId: "k1", viaParentOrgId: "org-1" });
  });

  it("a scoped key whose org is itself a child is not entitled: old SRC_MISMATCH", async () => {
    table.find((o) => o.id === "org-1")!.parentOrganizationId = "other-parent";
    const res = await post(app, childBody);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error_code: "SRC_MISMATCH" });
  });
});
