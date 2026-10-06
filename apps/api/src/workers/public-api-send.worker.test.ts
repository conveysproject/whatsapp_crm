import { describe, it, expect, vi, beforeEach } from "vitest";

const { prisma, enqueueCb, wa, workerCtor, checkAccess } = vi.hoisted(() => ({
  checkAccess: vi.fn(),
  prisma: {
    message: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    conversation: { update: vi.fn() },
  },
  enqueueCb: vi.fn(),
  workerCtor: vi.fn(),
  wa: {
    sendTextMessage: vi.fn(), sendMediaMessage: vi.fn(), sendTemplateMessage: vi.fn(), sendInteractiveMessage: vi.fn(), sendLocationMessage: vi.fn(),
  },
}));
vi.mock("bullmq", () => {
  class Worker { handlers: Record<string, (...a: unknown[]) => unknown> = {}; constructor(...a: unknown[]) { workerCtor(...a); } on(ev: string, fn: (...a: unknown[]) => unknown) { this.handlers[ev] = fn; return this; } }
  return { Worker };
});
vi.mock("../lib/prisma.js", () => ({ prisma }));
vi.mock("../lib/public-api/callbacks.js", () => ({ enqueueStatusCallback: (...a: unknown[]) => enqueueCb(...a) }));
vi.mock("../lib/public-api/access.js", () => ({ checkPublicApiAccess: (...a: unknown[]) => checkAccess(...a) }));
vi.mock("../lib/public-api/queues.js", () => ({ publicApiSendQueue: {}, publicApiCallbackQueue: {} }));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/io-ref.js", () => ({ getIo: () => null }));
vi.mock("../lib/whatsapp.js", async () => {
  class WaApiError extends Error { constructor(m: string, readonly metaCode: number | null, readonly metaSubcode: number | null) { super(m); } }
  return { ...wa, WaApiError };
});

import { processSendJob, startPublicApiSendWorker, handleSendJobFailed } from "./public-api-send.worker.js";
import { WaApiError } from "../lib/whatsapp.js";

const job = (content: unknown) => ({ data: { messageId: "m1", organizationId: "org-1", to: "14155552672", content } }) as never;

describe("processSendJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "sending", conversationId: "conv-1" });
    prisma.organization.findUnique.mockResolvedValue({ phoneNumberId: "pn-1", wabaAccessToken: "tok" });
    prisma.message.update.mockResolvedValue({});
    prisma.conversation.update.mockResolvedValue({});
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
    checkAccess.mockResolvedValue({ allowed: true });
  });

  it.each(["blocked", "not_allowed"] as const)("access %s: never calls Meta, marks the message failed (conditional, org-scoped) and queues a failed callback", async (reason) => {
    checkAccess.mockResolvedValue({ allowed: false, reason });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(checkAccess).toHaveBeenCalledWith(prisma, "org-1");
    for (const fn of Object.values(wa)) expect(fn).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).toHaveBeenCalledWith({ where: { id: "m1", organizationId: "org-1", status: "sending" }, data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("fails closed: a thrown access lookup propagates and nothing is sent", async () => {
    checkAccess.mockRejectedValue(new Error("db down"));
    await expect(processSendJob(job({ kind: "text", text: "hi" }))).rejects.toThrow("db down");
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("an expired or already-handled message does not need the access lookup", async () => {
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "expired", conversationId: "conv-1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(checkAccess).not.toHaveBeenCalled();
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

  it("M2: a message expired by the stuck-message sweep gets a 'failed' callback and is never sent", async () => {
    prisma.message.findFirst.mockResolvedValue({ id: "m1", status: "expired", conversationId: "conv-1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("S5: the 'sent' callback is queued even when the cosmetic conversation update or emit fails", async () => {
    wa.sendTextMessage.mockResolvedValue({ messageId: "wamid.1" });
    prisma.conversation.update.mockRejectedValue(new Error("db hiccup"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(processSendJob(job({ kind: "text", text: "hi" }))).resolves.toBeUndefined();
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "sent");
    spy.mockRestore();
  });

  it("S5: the 'sent' callback is queued before the conversation is touched", async () => {
    wa.sendTextMessage.mockResolvedValue({ messageId: "wamid.1" });
    await processSendJob(job({ kind: "text", text: "hi" }));
    expect(enqueueCb.mock.invocationCallOrder[0]!).toBeLessThan(prisma.conversation.update.mock.invocationCallOrder[0]!);
  });
});

describe("startPublicApiSendWorker", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("M1: never re-runs a stalled job (maxStalledCount 0) and runs 20 sends in parallel", () => {
    startPublicApiSendWorker();
    const opts = workerCtor.mock.calls[0]![2] as { maxStalledCount?: number; concurrency?: number };
    expect(opts.maxStalledCount).toBe(0);
    expect(opts.concurrency).toBe(20);
  });

  it("registers the stalled-job failure handler", () => {
    const w = startPublicApiSendWorker() as unknown as { handlers: Record<string, unknown> };
    expect(typeof w.handlers["failed"]).toBe("function");
    expect(typeof w.handlers["error"]).toBe("function");
  });
});

describe("handleSendJobFailed", () => {
  const stalledJob = { id: "pubsend-m1", data: { messageId: "m1", organizationId: "org-1", to: "14155552672", content: { kind: "text", text: "hi" } } } as never;
  let errSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };
  beforeEach(() => {
    vi.clearAllMocks();
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.message.findFirst.mockResolvedValue({ status: "sending" });
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
  });

  it("M1: a stalled job whose message is still 'sending' marks it failed (org-scoped, conditional) and queues a 'failed' callback", async () => {
    await handleSendJobFailed(stalledJob, new Error("job stalled more than allowable limit"));
    expect(prisma.message.findFirst.mock.calls[0]![0].where).toMatchObject({ id: "m1", organizationId: "org-1" });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({ where: { id: "m1", organizationId: "org-1", status: "sending" }, data: { status: "failed" } });
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("a stalled job whose message was already expired still gets the 'failed' callback", async () => {
    prisma.message.findFirst.mockResolvedValue({ status: "expired" });
    await handleSendJobFailed(stalledJob, new Error("job stalled more than allowable limit"));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(enqueueCb).toHaveBeenCalledWith(expect.anything(), "m1", "failed", { errorCode: null });
  });

  it("leaves a message that was already sent alone", async () => {
    prisma.message.findFirst.mockResolvedValue({ status: "sent" });
    await handleSendJobFailed(stalledJob, new Error("job stalled more than allowable limit"));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(enqueueCb).not.toHaveBeenCalled();
  });

  it("ignores non-stalled failures", async () => {
    await handleSendJobFailed(stalledJob, new Error("redis went away"));
    await handleSendJobFailed(undefined, new Error("job stalled more than allowable limit"));
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(enqueueCb).not.toHaveBeenCalled();
  });

  it("never throws, and logs no phone number or message text", async () => {
    prisma.message.findFirst.mockRejectedValue(Object.assign(new Error("Invalid invocation: to 14155552672 text secret"), { name: "PrismaClientValidationError" }));
    await expect(handleSendJobFailed(stalledJob, new Error("job stalled more than allowable limit"))).resolves.toBeUndefined();
    await expect(handleSendJobFailed(stalledJob, new WaApiError('WA send failed: {"error":{"message":"to 14155552672"}}', 131047, null))).resolves.toBeUndefined();
    const logged = JSON.stringify(errSpy.mock.calls);
    expect(logged).not.toContain("14155552672");
    expect(logged).not.toContain("secret");
    errSpy.mockRestore();
  });
});
