import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { Webhook } from "svix";
import { clerkWebhookRouter } from "./clerk-webhook.js";

vi.mock("../lib/seed-lead-statuses.js", () => ({ seedLeadStatuses: vi.fn() }));
vi.mock("../lib/seed-default-pipeline.js", () => ({ seedDefaultPipeline: vi.fn() }));

const SECRET = `whsec_${Buffer.from("test-clerk-webhook-secret-32-bytes!!").toString("base64")}`;

const mockPrisma = {
  user: { updateMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  organization: { upsert: vi.fn() },
  invitation: { findFirst: vi.fn(), update: vi.fn() },
  loginLog: { create: vi.fn() },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  await app.register(clerkWebhookRouter);
  return app;
}

const payload = JSON.stringify({ type: "user.deleted", data: { id: "user_victim" } });

function signedHeaders(body: string, secret = SECRET): Record<string, string> {
  const id = "msg_test";
  const ts = new Date();
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
    "svix-signature": new Webhook(secret).sign(id, ts, body),
  };
}

describe("POST /webhooks/clerk signature check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["CLERK_WEBHOOK_SECRET"] = SECRET;
  });
  afterEach(() => {
    delete process.env["CLERK_WEBHOOK_SECRET"];
  });

  it("rejects a request with no svix headers and does not touch the database", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/webhooks/clerk", headers: { "content-type": "application/json" }, payload });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a request signed with the wrong secret", async () => {
    const app = await buildApp();
    const wrong = `whsec_${Buffer.from("some-other-secret-that-is-32-bytes!!").toString("base64")}`;
    const res = await app.inject({ method: "POST", url: "/webhooks/clerk", headers: signedHeaders(payload, wrong), payload });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("rejects every request when the webhook secret is not configured", async () => {
    delete process.env["CLERK_WEBHOOK_SECRET"];
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/webhooks/clerk", headers: signedHeaders(payload), payload });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("processes a correctly signed event", async () => {
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/webhooks/clerk", headers: signedHeaders(payload), payload });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user_victim" },
      data: { isActive: false, deletedAt: expect.any(Date) },
    });
  });
});
