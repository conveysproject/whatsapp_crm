import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, enqueueCb, wa } = vi.hoisted(() => ({
  prisma: {
    message: { findFirst: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    conversation: { update: vi.fn() },
  },
  enqueueCb: vi.fn(),
  wa: {
    sendTextMessage: vi.fn(), sendMediaMessage: vi.fn(), sendTemplateMessage: vi.fn(), sendInteractiveMessage: vi.fn(), sendLocationMessage: vi.fn(),
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a) }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiSendQueue: {}, publicApiCallbackQueue: {} }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/io-ref.js", () => ({ getIo: () => null }));
vi.mock("../lib/whatsapp.js", async () => {
  class WaApiError extends Error { constructor(m: string, readonly metaCode: number | null, readonly metaSubcode: number | null) { super(m); } }
  return { ...wa, WaApiError };
});

import { processSendJob } from "./public-api-send.worker.js";
import { WaApiError } from "../lib/whatsapp.js";

const job = (content: unknown) => ({ data: { messageId: "m1", organizationId: "org-1", to: "14155552672", content } }) as never;

describe("processSendJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sending", conversationId: "conv-1" });
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    prisma.message.update.mockResolvedValue({});
    prisma.conversation.update.mockResolvedValue({});
  });

  it("sends text, marks the message sent with the wamid, queues a 'sent' callback (org-scoped lookups)", async () => {
    wa.sendTextMessage.mockResolvedValue({ messageId: "wamid.1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "m1", organizationId: "org-1" });
    expect(wa.sendTextMessage).toHaveBeenCalledWith("pn-1", "14155552672", "hi", "tok");
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ where: { id: "m1" }, data: { status: "sent", whatsappMessageId: "wamid.1" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "sent");
  });

  it("dispatches by content kind", async () => {
    for (const fn of Object.values(wa)) fn.mockResolvedValue({ messageId: "w" });
    await processSendJob(job({ kind: "media", mediaUrl: "https://x/a.mp4", caption: "c" }));
    expect(wa.sendMediaMessage).toHaveBeenCalledWith("pn-1", "14155552672", "video", "https://x/a.mp4", "c", "tok");
    await processSendJob(job({ kind: "template", name: "t", language: "en", components: [] }));
    expect(wa.sendTemplateMessage).toHaveBeenCalledWith("pn-1", "14155552672", "t", "en", [], "tok");
    await processSendJob(job({ kind: "location", latitude: "1", longitude: "2", name: "n", address: "a" }));
    expect(wa.sendLocationMessage).toHaveBeenCalled();
    await processSendJob(job({ kind: "interactive", interactive: { type: "button", body: { text: "b" }, action: {} } }));
    expect(wa.sendInteractiveMessage).toHaveBeenCalled();
  });

  it("on a Meta rejection: message failed, mapped Plivo error code, 'failed' callback, no throw", async () => {
    wa.sendTextMessage.mockRejectedValue(new WaApiError("WA send failed: {...}", 131047, null));
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: "380" });
  });

  it("unmapped errors still fail the message and queue a failed callback without an error code", async () => {
    wa.sendTextMessage.mockRejectedValue(new Error("network down"));
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(prisma.message.update.mock.calls[0]![0]).toMatchObject({ data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("fails the message when WhatsApp was disconnected after acceptance", async () => {
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: null, wabaAccessToken: null });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: "310" });
  });

  it("is idempotent: skips messages that are not 'sending' or not found for the org", async () => {
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sent", conversationId: "conv-1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    prisma.message.findFirst.mockResolvedValue(null);
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
  });
});
