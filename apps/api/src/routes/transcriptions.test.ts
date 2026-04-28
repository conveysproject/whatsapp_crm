import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("openai", () => ({
  default: class {
    audio = {
      transcriptions: {
        create: vi.fn().mockResolvedValue({ text: "Hello, I need help with my order." }),
      },
    };
  },
}));

vi.mock("../lib/whisper.js", () => ({
  transcribeAudio: vi.fn().mockResolvedValue("Hello, I need help with my order."),
}));

const mockPrisma = {
  message: { findFirst: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "agent" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { transcriptionsRouter } = await import("./transcriptions.js");
  await app.register(transcriptionsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/messages/:id/transcribe", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("transcribes audio message and updates body", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: "msg-1", organizationId: "org-1", contentType: "audio", whatsappMessageId: "wamid.audio",
    });
    mockPrisma.message.update.mockResolvedValue({ id: "msg-1", body: "Hello, I need help." });

    const res = await app.inject({ method: "POST", url: "/v1/messages/msg-1/transcribe" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { transcript: string } }>().data.transcript).toBeTruthy();
  });

  it("returns 400 for non-audio message", async () => {
    mockPrisma.message.findFirst.mockResolvedValue({
      id: "msg-2", organizationId: "org-1", contentType: "text",
    });
    const res = await app.inject({ method: "POST", url: "/v1/messages/msg-2/transcribe" });
    expect(res.statusCode).toBe(400);
  });
});
