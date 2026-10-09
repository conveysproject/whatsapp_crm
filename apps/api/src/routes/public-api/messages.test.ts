import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type * as SafeUrlModule from "../../lib/public-api/safe-url.js";

const sendAdd = vi.fn();
const enqueueCb = vi.fn();
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: (...a: unknown[]) => sendAdd(...a) }, publicApiCallbackQueue: { add: vi.fn() } }));
vi.mock("../../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a), businessNumberDigits: async (p: PrismaClient, org: string) => {
    const r = await p.vendorSetting.findFirst({ where: { organizationId: org, key: "current_phone_number_number" } });
    return (r?.value ?? "").replace(/\D/g, "");
  },
}));
vi.mock("../../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof SafeUrlModule>();
  return { ...real, assertSafeCallbackUrl: vi.fn(async (u: string) => { if (u.includes("bad")) throw new real.UnsafeUrlError("unsafe"); return new URL(u); }) };
});

const mockPrisma = {
  organization: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  apiKey: { findUnique: vi.fn() },
  template: { findMany: vi.fn() },
  contact: { upsert: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn() },
  message: { create: vi.fn(), update: vi.fn() },
  apiMessageMeta: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
};

const logLines: string[] = [];
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "error", stream: { write: (line: string) => { logLines.push(line); } } } });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.publicApi = { apiKeyId: "k1", organizationId: "org-1" }; });
  const { publicApiMessagesRouter } = await import("./messages.js");
  await app.register(publicApiMessagesRouter, { prefix: "/v1/Account/:authId" });
  return app;
}

const body = { src: "+14155552671", dst: "+14155552672", type: "whatsapp", text: "hello" };
const post = (app: FastifyInstance, payload: unknown, url = "/v1/Account/k1/Message/") => app.inject({ method: "POST", url, payload: payload as object });

describe("POST /Message/", () => {
  let app: FastifyInstance;
  let n = 0;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); n = 0;
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "SECRET_TOKEN_XYZ" });
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-555-2671" });
    mockPrisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: null });
    mockPrisma.contact.upsert.mockResolvedValue({ id: "c1" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.create.mockImplementation(async () => ({ id: `msg-${++n}` }));
    mockPrisma.apiMessageMeta.create.mockResolvedValue({});
    mockPrisma.message.update.mockResolvedValue({});
    enqueueCb.mockResolvedValue(undefined);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("accepts a text send: 202, one uuid per destination, org-scoped rows, job queued, queued callback", async () => {
    const res = await post(app, { ...body, dst: "+14155552672<+14155550000" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ message: "message(s) queued", message_uuid: ["msg-1", "msg-2"], api_id: expect.any(String) });
    expect(mockPrisma.message.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1", direction: "outbound", contentType: "text", body: "hello", status: "sending" });
    expect(mockPrisma.contact.upsert.mock.calls[0]![0].where).toEqual({ organizationId_phoneNumber: { organizationId: "org-1", phoneNumber: "14155552672" } });
    expect(mockPrisma.apiMessageMeta.create.mock.calls[0]![0].data).toMatchObject({ messageId: "msg-1", apiKeyId: "k1", organizationId: "org-1", dst: "14155552672" });
    expect(mockPrisma.conversation.findFirst.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", whatsappContactId: "14155552672" });
    expect(sendAdd).toHaveBeenCalledTimes(2);
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ messageId: "msg-1", organizationId: "org-1", to: "14155552672", content: { kind: "text", text: "hello" } });
    expect(JSON.stringify(sendAdd.mock.calls)).not.toContain("SECRET_TOKEN_XYZ"); // Meta token never goes into Redis
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "msg-1", "queued");
  });

  it("works without the trailing slash too", async () => {
    expect((await post(app, body, "/v1/Account/k1/Message")).statusCode).toBe(202);
  });

  it("creates the conversation silently (no assignment) for a brand-new number", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: "conv-new" });
    await post(app, body);
    expect(mockPrisma.conversation.create.mock.calls[0]![0].data).toMatchObject({ organizationId: "org-1", whatsappContactId: "14155552672", channelType: "whatsapp", status: "open" });
    expect(mockPrisma.conversation.create.mock.calls[0]![0].data.assignedTo).toBeUndefined();
  });

  it("400 for validation errors with the Plivo error body, and nothing is written", async () => {
    const res = await post(app, { ...body, dst: "+14155552672<abc" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: expect.any(String), api_id: expect.any(String) });
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("send errors carry error_code and a hint", async () => {
    const r1 = await post(app, { ...body, dst: "+14155552672<abc" });
    expect(r1.json()).toMatchObject({ error_code: "VALIDATION_FAILED", error: "Invalid destination number: abc", hint: "Fix the field named in the message and send again." });
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    expect((await post(app, body)).json()).toMatchObject({
      error_code: "WHATSAPP_NOT_CONNECTED", error: "No WhatsApp number is connected to this account.", hint: "Connect a WhatsApp Business number in WBMSG first.",
    });
  });

  it("src mismatch tells the client which number is connected (masked)", async () => {
    const r = await post(app, { ...body, src: "+14155551234" });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error_code: "SRC_MISMATCH", hint: "Set src to the connected number (ends in 2671)." });
    expect(r.body).not.toContain("14155552671");
  });

  it("an empty connected number is reported as not connected", async () => {
    mockPrisma.vendorSetting.findFirst.mockResolvedValue(null);
    const r = await post(app, body);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error_code: "WHATSAPP_NOT_CONNECTED", error: "No WhatsApp number is connected to this account." });
  });

  it("an unsafe callback URL gets CALLBACK_URL_INVALID", async () => {
    const r = await post(app, { ...body, url: "https://bad.example.com/cb" });
    expect(r.json()).toMatchObject({ error_code: "CALLBACK_URL_INVALID", error: "url: unsafe" });
  });

  it("a non-JSON-object body keeps its message and says to send application/json", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/Account/k1/Message/", payload: "hello", headers: { "content-type": "text/plain" } });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      error: "Request body must be a JSON object", error_code: "VALIDATION_FAILED",
      hint: "Send a JSON object with the header Content-Type: application/json.",
    });
  });

  it("template errors use TEMPLATE_* codes", async () => {
    mockPrisma.template.findMany.mockResolvedValue([]);
    const r = await post(app, { ...body, text: undefined, template: { name: "nope", language: "en" } });
    expect(r.json()).toMatchObject({ error_code: "TEMPLATE_NOT_FOUND", error: 'Template "nope" not found' });
    const tpl = { name: "welcome", language: "en_US", status: "pending", parameterFormat: "POSITIONAL", components: [{ type: "BODY", text: "Hi" }] };
    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const na = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } });
    expect(na.json()).toMatchObject({ error_code: "TEMPLATE_NOT_APPROVED" });
    mockPrisma.template.findMany.mockResolvedValue([{ ...tpl, status: "approved" }]);
    const pm = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "x" }] }] } });
    expect(pm.json()).toMatchObject({ error_code: "TEMPLATE_PARAMS_MISMATCH" });
  });

  it("400 when src is not the org's connected number", async () => {
    const res = await post(app, { ...body, src: "+14155551234" });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("400 when WhatsApp is not connected", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    expect((await post(app, body)).statusCode).toBe(400);
  });

  it("400 for an unsafe per-message callback URL", async () => {
    expect((await post(app, { ...body, url: "https://bad.example.com/cb" })).statusCode).toBe(400);
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
  });

  it("template: org-scoped lookup by name, picks the approved row of the exact language; specific 400s otherwise", async () => {
    const tpl = { name: "welcome", language: "en_US", status: "approved", parameterFormat: "POSITIONAL",
      components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{1}}" }] };
    const comps = [
      { type: "header", parameters: [{ type: "media", media: "https://x/a.png" }] },
      { type: "body", parameters: [{ type: "text", text: "Ann" }] },
    ];
    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const ok = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US", components: comps } });
    expect(ok.statusCode).toBe(202);
    expect(mockPrisma.template.findMany.mock.calls[0]![0].where).toEqual({ organizationId: "org-1", name: "welcome" });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "template", name: "welcome", language: "en_US" });

    mockPrisma.template.findMany.mockResolvedValue([]);
    const nf = await post(app, { ...body, text: undefined, template: { name: "nope", language: "en" } });
    expect(nf.statusCode).toBe(400);
    expect(nf.json().error).toMatch(/not found/);

    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const lang = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en" } });
    expect(lang.json().error).toMatch(/available: en_US/);

    mockPrisma.template.findMany.mockResolvedValue([{ ...tpl, status: "pending" }]);
    expect((await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } })).json().error).toMatch(/not approved \(status: pending\)/);

    mockPrisma.template.findMany.mockResolvedValue([tpl, tpl]);
    expect((await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } })).statusCode).toBe(400);
  });

  it("template: 400 'template parameters not matched' for wrong count or names, and nothing is written", async () => {
    mockPrisma.template.findMany.mockResolvedValue([{ name: "kyc", language: "en", status: "approved", parameterFormat: "NAMED",
      components: [{ type: "BODY", text: "Hi {{username}}, by {{ra_name}}" }] }]);
    sendAdd.mockClear(); mockPrisma.message.create.mockClear();
    const res = await post(app, { ...body, text: undefined, template: { name: "kyc", language: "en",
      components: [{ type: "body", parameters: [{ type: "text", parameter_name: "username", text: "Alex" }] }] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("template parameters not matched for BODY: expected [username, ra_name]; got [username]");
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(sendAdd).not.toHaveBeenCalled();

    const ok = await post(app, { ...body, text: undefined, template: { name: "kyc", language: "en",
      components: [{ type: "body", parameters: [
        { type: "text", parameter_name: "ra_name", text: "WB-1001" }, { type: "text", parameter_name: "username", text: "Alex" }] }] } });
    expect(ok.statusCode).toBe(202);
    expect(sendAdd.mock.calls[0]![1].content.components[0].parameters).toEqual([
      { type: "text", text: "WB-1001", parameter_name: "ra_name" }, { type: "text", text: "Alex", parameter_name: "username" }]);
  });

  it("maps location and interactive content into the queued job", async () => {
    await post(app, { ...body, text: undefined, location: { latitude: "1", longitude: "2", name: "n", address: "a" } });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "location" });
    sendAdd.mockClear();
    await post(app, { ...body, text: undefined, interactive: { type: "button", body: { text: "Pick" }, action: { buttons: [{ title: "A", id: "1" }] } } });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "interactive", interactive: { type: "button" } });
  });

  it("partial failure: second destination's message.create rejects -> 202 with one uuid, only the first queued", async () => {
    mockPrisma.message.create.mockResolvedValueOnce({ id: "msg-1" }).mockRejectedValueOnce(new Error("db down"));
    const res = await post(app, { ...body, dst: "+14155552672<+14155550000" });
    expect(res.statusCode).toBe(202);
    expect(res.json().message_uuid).toEqual(["msg-1"]);
    expect(sendAdd).toHaveBeenCalledTimes(1);
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ messageId: "msg-1" });
  });

  it("500 with the Plivo error body when every destination fails", async () => {
    mockPrisma.message.create.mockRejectedValue(new Error("db down"));
    const res = await post(app, { ...body, dst: "+14155552672<+14155550000" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error_code: "QUEUE_FAILED", error: "We could not queue your message.", hint: expect.any(String), api_id: expect.any(String) });
    expect(sendAdd).not.toHaveBeenCalled();
  });

  it("S1: the queued callback is enqueued before the send job, so it can never lose the race to the worker's 'sent'", async () => {
    await post(app, body);
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "msg-1", "queued");
    expect(enqueueCb.mock.invocationCallOrder[0]!).toBeLessThan(sendAdd.mock.invocationCallOrder[0]!);
  });

  it("a send-queue failure after the queued callback marks the message failed and reports it failed", async () => {
    sendAdd.mockRejectedValueOnce(new Error("redis down"));
    const res = await post(app, body);
    expect(res.statusCode).toBe(500);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "msg-1", organizationId: "org-1" }, data: { status: "failed" } }));
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "msg-1", "failed", { errorCode: null });
  });

  it("S4: per-destination failures log no phone number or message text (only error name/code and ids)", async () => {
    logLines.length = 0;
    const leaky = Object.assign(new Error("Invalid prisma.message.create() invocation: { phoneNumber: \"14155552672\", body: \"hello\" }"), { name: "PrismaClientValidationError" });
    mockPrisma.message.create.mockRejectedValue(leaky);
    expect((await post(app, { ...body, text: "top secret words" })).statusCode).toBe(500);
    mockPrisma.message.create.mockImplementation(async () => ({ id: "msg-9" }));
    enqueueCb.mockRejectedValue(Object.assign(new Error("redis said 14155552672 top secret words"), { code: "ECONNREFUSED" }));
    expect((await post(app, { ...body, text: "top secret words" })).statusCode).toBe(202);
    const logged = logLines.join("");
    expect(logged).toContain("PrismaClientValidationError");
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).toContain("msg-9");
    expect(logged).not.toContain("14155552672");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("hello");
  });

  it("S8: media messages are stored with the inbox media kind (image/video/document) as contentType", async () => {
    const cases: Array<[string, string]> = [["https://cdn.example.com/a.jpg", "image"], ["https://cdn.example.com/b.mp4", "video"], ["https://cdn.example.com/c.pdf?x=1", "document"]];
    for (const [url, kind] of cases) {
      mockPrisma.message.create.mockClear();
      expect((await post(app, { ...body, text: undefined, media_urls: [url] })).statusCode).toBe(202);
      expect(mockPrisma.message.create.mock.calls[0]![0].data).toMatchObject({ contentType: kind, mediaUrl: url });
    }
  });

  it("a rejecting queued-callback enqueue does not fail the request", async () => {
    enqueueCb.mockRejectedValue(new Error("redis down"));
    const res = await post(app, body);
    expect(res.statusCode).toBe(202);
    expect(res.json().message_uuid).toEqual(["msg-1"]);
    expect(sendAdd).toHaveBeenCalledTimes(1);
  });

  it("apiMessageMeta.create rejecting after message.create marks that message failed and queues nothing for it", async () => {
    mockPrisma.apiMessageMeta.create.mockRejectedValueOnce(new Error("constraint"));
    const res = await post(app, { ...body, dst: "+14155552672<+14155550000" });
    expect(res.statusCode).toBe(202);
    expect(res.json().message_uuid).toEqual(["msg-2"]);
    expect(mockPrisma.message.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "msg-1", organizationId: "org-1" }, data: expect.objectContaining({ status: "failed" }) }));
    expect(sendAdd).toHaveBeenCalledTimes(1);
    expect(sendAdd.mock.calls[0]![1]).toMatchObject({ messageId: "msg-2" });
  });
});

describe("GET /Message/", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-555-2671" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  const row = (over: Record<string, unknown> = {}) => ({
    messageId: "m1", dst: "14155552672", lastStatus: "delivered", errorCode: null, queuedAt: new Date("2026-10-05T10:00:00Z"),
    message: { id: "m1", status: "delivered" }, ...over,
  });

  it("lists org-scoped API messages with Plivo pagination meta", async () => {
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([row()]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(45);
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?limit=20&offset=20" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ meta: Record<string, unknown>; objects: Array<Record<string, unknown>> }>();
    expect(body.meta).toMatchObject({ limit: 20, offset: 20, total_count: 45, previous: expect.any(String), next: expect.any(String) });
    expect(body.objects[0]).toMatchObject({ message_uuid: "m1", message_direction: "outbound", message_state: "delivered", message_type: "whatsapp", from_number: "14155552671", to_number: "14155552672", message_time: "2026-10-05 10:00:00+00:00" });
    const where = mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ organizationId: "org-1" });
  });

  it("caps limit at 20 and applies filters", async () => {
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(0);
    await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?limit=500&message_state=failed&error_code=380&message_time__gt=2026-10-05%2000:00:00" });
    const arg = mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0];
    expect(arg.take).toBe(20);
    expect(arg.where).toMatchObject({ organizationId: "org-1", lastStatus: "failed", errorCode: "380" });
    expect(arg.where.queuedAt.gt).toEqual(new Date("2026-10-05T00:00:00Z"));
  });

  it("returns an empty page for inbound direction (inbound messages are not API-listed)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?message_direction=inbound" });
    expect(res.json<{ objects: unknown[] }>().objects).toEqual([]);
    expect(mockPrisma.apiMessageMeta.findMany).not.toHaveBeenCalled();
  });

  it("400 for a bad time filter", async () => {
    const bad = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/?message_time__gt=garbage" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({
      error_code: "VALIDATION_FAILED", error: "message_time filters must be yyyy-MM-dd HH:mm:ss",
      hint: "Send message_time__gt and message_time__lt as yyyy-MM-dd HH:mm:ss, for example 2026-10-05 00:00:00.",
    });
  });

  const list = (qs: string) => app.inject({ method: "GET", url: `/v1/Account/k1/Message/?${qs}` });
  const emptyMocks = (total = 0) => {
    mockPrisma.apiMessageMeta.findMany.mockResolvedValue([]);
    mockPrisma.apiMessageMeta.count.mockResolvedValue(total);
  };

  it("repeated message_state/error_code use the first value (no 500)", async () => {
    emptyMocks();
    const res = await list("message_state=a&message_state=b&error_code=1&error_code=2");
    expect(res.statusCode).toBe(200);
    const where = mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0].where;
    expect(where.lastStatus).toBe("a");
    expect(where.errorCode).toBe("1");
  });

  it("repeated time filters use the first value; an invalid first value is 400", async () => {
    emptyMocks();
    const ok = await list("message_time__gt=2026-10-05%2000:00:00&message_time__gt=garbage");
    expect(ok.statusCode).toBe(200);
    expect(mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0].where.queuedAt.gt).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect((await list("message_time__lt=garbage&message_time__lt=2026-10-05%2000:00:00")).statusCode).toBe(400);
  });

  it("repeated or non-numeric limit/offset fall back safely", async () => {
    emptyMocks();
    expect((await list("limit=5&limit=7&offset=3&offset=9")).statusCode).toBe(200);
    expect((await list("limit=abc&offset=xyz")).statusCode).toBe(200);
    const calls = mockPrisma.apiMessageMeta.findMany.mock.calls;
    expect(calls[0]![0]).toMatchObject({ take: 5, skip: 3 });
    expect(calls[1]![0]).toMatchObject({ take: 20, skip: 0 });
  });

  it("clamps a huge offset to an int32-safe value and returns an empty page", async () => {
    emptyMocks(45);
    const res = await list("offset=99999999999999999999");
    expect(res.statusCode).toBe(200);
    const arg = mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0];
    expect(arg.skip).toBeLessThanOrEqual(2147483647);
    expect(res.json<{ meta: { offset: number } }>().meta.offset).toBe(arg.skip);
  });

  it("next/previous links preserve the caller's filters", async () => {
    emptyMocks(45);
    const res = await list("message_state=failed&error_code=380&limit=10&offset=10");
    const { meta } = res.json<{ meta: { next: string; previous: string } }>();
    const next = new URL(meta.next, "http://x");
    expect(next.pathname).toBe("/v1/Account/k1/Message/");
    expect(next.searchParams.get("message_state")).toBe("failed");
    expect(next.searchParams.get("error_code")).toBe("380");
    expect(next.searchParams.get("limit")).toBe("10");
    expect(next.searchParams.get("offset")).toBe("20");
    const prev = new URL(meta.previous, "http://x");
    expect(prev.searchParams.get("message_state")).toBe("failed");
    expect(prev.searchParams.get("offset")).toBe("0");
    emptyMocks(45);
    const end = (await list("message_state=failed&limit=10&offset=40")).json<{ meta: { next: string | null } }>();
    expect(end.meta.next).toBeNull();
  });

  it("orders by queuedAt desc with a messageId tiebreaker and scopes count by org", async () => {
    emptyMocks();
    await list("limit=5");
    expect(mockPrisma.apiMessageMeta.findMany.mock.calls[0]![0].orderBy).toEqual([{ queuedAt: "desc" }, { messageId: "desc" }]);
    expect(mockPrisma.apiMessageMeta.count.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1" });
  });
});

describe("GET /Message/:uuid/", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    mockPrisma.vendorSetting.findFirst.mockResolvedValue({ value: "14155552671" });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns the message, looked up by uuid AND org", async () => {
    mockPrisma.apiMessageMeta.findFirst.mockResolvedValue({ messageId: "m1", dst: "14155552672", lastStatus: "sent", errorCode: null, queuedAt: new Date("2026-10-05T10:00:00Z"), message: { id: "m1", status: "sent" } });
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/m1/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ message_uuid: "m1", message_state: "sent", api_id: expect.any(String) });
    expect(mockPrisma.apiMessageMeta.findFirst.mock.calls[0]![0].where).toEqual({ messageId: "m1", organizationId: "org-1" });
  });

  it("404 (same body as unknown) for another org's message", async () => {
    mockPrisma.apiMessageMeta.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/Account/k1/Message/other-org-msg/" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "Message not found.", error_code: "MESSAGE_NOT_FOUND", hint: expect.any(String), api_id: expect.any(String) });
  });

  it("unknown-uuid and cross-org 404 bodies are identical except api_id", async () => {
    mockPrisma.apiMessageMeta.findFirst.mockResolvedValue(null);
    const a = (await app.inject({ method: "GET", url: "/v1/Account/k1/Message/unknown/" })).json<Record<string, unknown>>();
    const b = (await app.inject({ method: "GET", url: "/v1/Account/k1/Message/other-org-msg/" })).json<Record<string, unknown>>();
    delete a["api_id"]; delete b["api_id"];
    expect(a).toEqual(b);
  });
});
