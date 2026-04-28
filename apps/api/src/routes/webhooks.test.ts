import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../lib/whatsapp.js", () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  sendTextMessage: vi.fn(),
}));

const mockPrisma = {
  organization: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { create: vi.fn() },
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
              text: { body: "Hello TrustCRM" },
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
        body: "Hello TrustCRM",
        whatsappMessageId: "wamid.abc",
      })
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
