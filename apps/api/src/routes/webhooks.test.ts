import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../lib/public-api/callbacks.js", () => ({
  forwardMetaStatusToApiClient: vi.fn().mockResolvedValue(undefined),
}));

const io = vi.hoisted(() => ({ to: vi.fn(), emit: vi.fn() }));
vi.mock("../lib/io-ref.js", () => ({ getIo: () => ({ to: io.to }) }));

vi.mock("../lib/whatsapp.js", () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  sendTextMessage: vi.fn(),
}));

const mockPrisma = {
  organization: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  campaignRecipient: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), updateMany: vi.fn() },
  inboundMessageDump: { create: vi.fn().mockResolvedValue(undefined) },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { webhooksRouter } = await import("./webhooks.js");
  await app.register(webhooksRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/webhooks/whatsapp", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns challenge when verify_token matches", async () => {
    process.env["WA_VERIFY_TOKEN"] = "trustcrm_verify_2026";
    const res = await app.inject({
      method: "GET",
      url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=trustcrm_verify_2026&hub.challenge=testchallenge",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("testchallenge");
  });

  it("returns 403 on wrong token", async () => {
    process.env["WA_VERIFY_TOKEN"] = "trustcrm_verify_2026";
    const res = await app.inject({
      method: "GET",
      url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc",
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /v1/webhooks/whatsapp", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    app = await buildApp();
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-1" });
  });
  afterEach(async () => { await app.close(); });

  it("enqueues message job and returns 200", async () => {
    const { inboundMessageQueue } = await import("../lib/queue.js");
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "entry-1",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "12345" },
            messages: [{
              id: "wamid.abc",
              from: "+919876543210",
              timestamp: "1714180800",
              type: "text",
              text: { body: "Hello WBMSG" },
            }],
          },
        }],
      }],
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/whatsapp",
      headers: { "x-hub-signature-256": "sha256=mocked" },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(inboundMessageQueue.add).toHaveBeenCalledWith(
      "inbound",
      expect.objectContaining({
        organizationId: "org-1",
        whatsappContactPhone: "+919876543210",
        body: "Hello WBMSG",
        whatsappMessageId: "wamid.abc",
      }),
      expect.objectContaining({ jobId: "wamsg-wamid.abc" })
    );
  });

  it("returns 400 for unknown object type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/whatsapp",
      headers: { "x-hub-signature-256": "sha256=mocked" },
      payload: { object: "unknown", entry: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/webhooks/whatsapp status updates (public API hook)", () => {
  let app: FastifyInstance;
  const prev = process.env["PUBLIC_API_ENABLED"];
  const statusPayload = {
    object: "whatsapp_business_account",
    entry: [{ id: "e1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "12345" }, statuses: [{ id: "wamid.out", status: "read", timestamp: "1714180800", recipient_id: "14155552672" }] } }] }],
  };
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    app = await buildApp();
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-1" });
    mockPrisma.message.findFirst.mockResolvedValue({ id: "m1", status: "read" });
  });
  afterEach(async () => {
    await app.close();
    if (prev === undefined) delete process.env["PUBLIC_API_ENABLED"]; else process.env["PUBLIC_API_ENABLED"] = prev;
  });
  const send = () => app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "x-hub-signature-256": "sha256=mocked" }, payload: statusPayload });

  it("S2: does not call the public API status hook when PUBLIC_API_ENABLED is off", async () => {
    delete process.env["PUBLIC_API_ENABLED"];
    const { forwardMetaStatusToApiClient } = await import("../lib/public-api/callbacks.js");
    expect((await send()).statusCode).toBe(200);
    expect(forwardMetaStatusToApiClient).not.toHaveBeenCalled();
  });

  it("calls the public API status hook when PUBLIC_API_ENABLED is true", async () => {
    process.env["PUBLIC_API_ENABLED"] = "true";
    const { forwardMetaStatusToApiClient } = await import("../lib/public-api/callbacks.js");
    expect((await send()).statusCode).toBe(200);
    expect(forwardMetaStatusToApiClient).toHaveBeenCalledWith(expect.anything(), "m1", expect.objectContaining({ status: "read" }));
  });
});

describe("POST /v1/webhooks/whatsapp: Meta delivery FAILURES are recorded (dashboard messages and campaigns)", () => {
  let app: FastifyInstance;
  const statusBody = (status: string, extra: Record<string, unknown> = {}) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "e1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "12345" }, statuses: [{ id: "wamid.out", status, timestamp: "1714180800", recipient_id: "919752250586", ...extra }] } }] }],
  });
  const send = (status: string, extra: Record<string, unknown> = {}) =>
    app.inject({ method: "POST", url: "/v1/webhooks/whatsapp", headers: { "x-hub-signature-256": "sha256=mocked" }, payload: statusBody(status, extra) });

  let logSpy: { mockRestore: () => void; mock: { calls: unknown[][] } };
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    delete process.env["PUBLIC_API_ENABLED"];
    io.to.mockReturnValue({ emit: io.emit });
    app = await buildApp();
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-1" });
    mockPrisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sent" });
    mockPrisma.message.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.message.update.mockResolvedValue({});
    mockPrisma.campaignRecipient.findFirst.mockResolvedValue(null);
    mockPrisma.campaignRecipient.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(async () => { await app.close(); logSpy.mockRestore(); });

  it("marks a SENT message failed with ONE conditional update that can never overwrite delivered/read, and tells the UI", async () => {
    expect((await send("failed", { errors: [{ code: 131049 }] })).statusCode).toBe(200);
    expect(mockPrisma.message.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.message.updateMany.mock.calls[0]![0] as { where: { id: string; status: { in: string[] } }; data: { status: string } };
    expect(arg.where.id).toBe("m1");
    expect(arg.where.status.in.sort()).toEqual(["sending", "sent"]);
    expect(arg.data).toEqual({ status: "failed" });
    expect(io.to).toHaveBeenCalledWith("org:org-1");
    expect(io.emit).toHaveBeenCalledWith("message:status", { whatsappMessageId: "wamid.out", status: "failed" });
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it("does not tell the UI 'failed' when the message already reached delivered/read (update matched nothing)", async () => {
    mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.message.findFirst.mockResolvedValueOnce({ id: "m1", status: "delivered" }).mockResolvedValueOnce({ status: "delivered" });
    expect((await send("failed")).statusCode).toBe(200);
    expect(mockPrisma.message.updateMany).toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("still tells the UI when another path (the public API hook) already recorded the failure", async () => {
    mockPrisma.message.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.message.findFirst.mockResolvedValueOnce({ id: "m1", status: "sent" }).mockResolvedValueOnce({ status: "failed" });
    expect((await send("failed")).statusCode).toBe(200);
    expect(io.emit).toHaveBeenCalledWith("message:status", { whatsappMessageId: "wamid.out", status: "failed" });
  });

  it("records the failure but skips the UI event when the organization cannot be resolved", async () => {
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    expect((await send("failed")).statusCode).toBe(200);
    expect(mockPrisma.message.updateMany).toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("a late 'delivered' still recovers a message previously marked failed (existing behaviour kept)", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: "m1", status: "failed" });
    expect((await send("delivered")).statusCode).toBe(200);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { status: "delivered" } });
  });

  it("keeps the existing behaviour for other statuses (delivered after sent is a normal update, no failure path)", async () => {
    expect((await send("delivered")).statusCode).toBe(200);
    expect(mockPrisma.message.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { status: "delivered" } });
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    expect(io.emit).toHaveBeenCalledWith("message:status", { whatsappMessageId: "wamid.out", status: "delivered" });
  });

  it("ignores a failure for a wamid we do not know (no write, still 200)", async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);
    expect((await send("failed")).statusCode).toBe(200);
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it("records the failure for a CAMPAIGN recipient with a conditional update (never over delivered/played/read)", async () => {
    mockPrisma.campaignRecipient.findFirst.mockResolvedValue({ id: "r1", status: "sent", contactId: "c1", campaign: { id: "camp1" } });
    expect((await send("failed")).statusCode).toBe(200);
    expect(mockPrisma.campaignRecipient.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.campaignRecipient.updateMany.mock.calls[0]![0] as { where: { id: string; status: { in: string[] } }; data: { status: string } };
    expect(arg.where.id).toBe("r1");
    expect(arg.where.status.in.sort()).toEqual(["accepted", "pending", "sent"]);
    expect(arg.data).toEqual({ status: "failed" });
    expect(mockPrisma.campaignRecipient.update).not.toHaveBeenCalled();
  });

  it("stores Meta's failure code as the campaign recipient's error message when Meta provides one", async () => {
    mockPrisma.campaignRecipient.findFirst.mockResolvedValue({ id: "r1", status: "sent", contactId: "c1", campaign: { id: "camp1" } });
    expect((await send("failed", { errors: [{ code: 131049 }] })).statusCode).toBe(200);
    const arg = mockPrisma.campaignRecipient.updateMany.mock.calls[0]![0] as { data: { status: string; errorMessage?: string } };
    expect(arg.data).toEqual({ status: "failed", errorMessage: "Meta delivery failed (code 131049)" });
  });

  it("keeps the existing campaign ratchet for delivered (plain forward update)", async () => {
    mockPrisma.campaignRecipient.findFirst.mockResolvedValue({ id: "r1", status: "sent", contactId: null, campaign: { id: "camp1" } });
    expect((await send("delivered")).statusCode).toBe(200);
    expect(mockPrisma.campaignRecipient.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "delivered" } });
    expect(mockPrisma.campaignRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("logs Meta's failure code for diagnosis without logging the recipient's phone number", async () => {
    await send("failed", { errors: [{ code: 131049 }] });
    const lines = logSpy.mock.calls.map((c) => c.join(" ")).filter((l) => l.includes("STATUS"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" | ")).toContain("131049");
    expect(lines.join(" | ")).toContain("wamid.out");
    expect(lines.join(" | ")).not.toContain("919752250586");
  });
});
