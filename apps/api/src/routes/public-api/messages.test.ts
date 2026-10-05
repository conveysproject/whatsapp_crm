import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const sendAdd = vi.fn();
const enqueueCb = vi.fn();
vi.mock("../../lib/public-api/queues.js", () => ({ publicApiSendQueue: { add: (...a: unknown[]) => sendAdd(...a) }, publicApiCallbackQueue: { add: vi.fn() } }));
vi.mock("../../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a), businessNumberDigits: vi.fn() }));
vi.mock("../../lib/public-api/safe-url.js", async (orig) => {
  const real = await orig<typeof import("../../lib/public-api/safe-url.js")>();
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
  apiMessageMeta: { create: vi.fn() },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
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

  it("template: resolves by org+name+language+approved; 400 when missing or ambiguous", async () => {
    const tpl = { name: "welcome", language: "en_US", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hi {{1}}" }] };
    mockPrisma.template.findMany.mockResolvedValue([tpl]);
    const ok = await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "Ann" }] }] } });
    expect(ok.statusCode).toBe(202);
    expect(mockPrisma.template.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", name: "welcome", language: "en_US", status: "approved" });
    expect(sendAdd.mock.calls[0]![1].content).toMatchObject({ kind: "template", name: "welcome", language: "en_US", components: [{ type: "body", parameters: [{ type: "text", text: "Ann" }] }] });
    mockPrisma.template.findMany.mockResolvedValue([]);
    expect((await post(app, { ...body, text: undefined, template: { name: "nope", language: "en" } })).statusCode).toBe(400);
    mockPrisma.template.findMany.mockResolvedValue([tpl, tpl]);
    expect((await post(app, { ...body, text: undefined, template: { name: "welcome", language: "en_US" } })).statusCode).toBe(400);
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
    expect(res.json()).toMatchObject({ error: "Failed to queue message", api_id: expect.any(String) });
    expect(sendAdd).not.toHaveBeenCalled();
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
