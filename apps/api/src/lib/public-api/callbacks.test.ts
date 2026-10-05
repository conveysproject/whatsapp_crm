import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const add = vi.fn();
vi.mock("./queues.js", () => ({ publicApiCallbackQueue: { add: (...a: unknown[]) => add(...a) }, publicApiSendQueue: { add: vi.fn() } }));
import { enqueueStatusCallback, buildStatusFields } from "./callbacks.js";

const prisma = {
  $transaction: vi.fn(),
  apiMessageMeta: { findUnique: vi.fn(), updateMany: vi.fn() },
  apiKey: { findUnique: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
};
const P = prisma as unknown as PrismaClient;

const meta = (over: Record<string, unknown> = {}) => ({
  messageId: "m1", apiKeyId: "k1", organizationId: "org-1", dst: "14155552672", callbackUrl: null, callbackMethod: "POST",
  errorCode: null, lastStatus: null, sequence: 0, queuedAt: new Date("2026-10-05T10:00:00.123Z"), sentAt: null, deliveryReportAt: null, ...over,
});

/** findUnique returns `m` for the initial read and `{ sequence: readBack }` for the in-transaction read-back (select: { sequence }). */
function setMeta(m: ReturnType<typeof meta> | null, readBack?: number) {
  prisma.apiMessageMeta.findUnique.mockImplementation(async (args: { select?: { sequence?: boolean } }) =>
    args.select?.sequence ? { sequence: readBack ?? (m ? (m.sequence as number) + 1 : 1) } : m);
}

describe("enqueueStatusCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    prisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: "https://c.example.com/cb" });
    prisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-555-2671" });
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 1 });
  });

  it("enqueues a queued callback with sequence 1 and form fields", async () => {
    setMeta(meta());
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.apiMessageMeta.updateMany.mock.calls[0]![0]).toMatchObject({ where: { messageId: "m1", lastStatus: null }, data: { lastStatus: "queued", sequence: { increment: 1 } } });
    const [name, data] = add.mock.calls[0]!;
    expect(name).toBe("status");
    expect(data).toMatchObject({ apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/cb", method: "POST" });
    expect(data.fields).toMatchObject({ MessageUUID: "m1", To: "14155552672", From: "14155552671", Type: "whatsapp", Status: "queued", Sequence: "1" });
    expect(data.fields["ErrorCode"]).toBeUndefined();
  });

  it("per-message URL overrides the credential default", async () => {
    setMeta(meta({ callbackUrl: "https://msg.example.com/x", callbackMethod: "GET" }));
    await enqueueStatusCallback(P, "m1", "queued");
    expect(add.mock.calls[0]![1]).toMatchObject({ url: "https://msg.example.com/x", method: "GET" });
  });

  it("only moves forward: read after delivered ok, delivered after read dropped, duplicate dropped", async () => {
    setMeta(meta({ lastStatus: "delivered", sequence: 2 }));
    await enqueueStatusCallback(P, "m1", "read");
    expect(add).toHaveBeenCalledTimes(1);
    setMeta(meta({ lastStatus: "read", sequence: 3 }));
    await enqueueStatusCallback(P, "m1", "delivered");
    await enqueueStatusCallback(P, "m1", "read");
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("failed/undelivered only before delivered; never after read/delivered/failed", async () => {
    setMeta(meta({ lastStatus: "sent" }));
    await enqueueStatusCallback(P, "m1", "undelivered", { errorCode: "380" });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "undelivered", ErrorCode: "380" });
    for (const last of ["delivered", "read", "failed", "undelivered"]) {
      setMeta(meta({ lastStatus: last }));
      await enqueueStatusCallback(P, "m1", "failed");
    }
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue when a concurrent writer won the ratchet (updateMany count 0)", async () => {
    setMeta(meta());
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 0 });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(add).not.toHaveBeenCalled();
  });

  it("emits the Sequence read back inside the transaction, not meta.sequence + 1", async () => {
    setMeta(meta({ sequence: 1, lastStatus: "queued" }), 5);
    await enqueueStatusCallback(P, "m1", "sent");
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "sent", Sequence: "5" });
  });

  it("enqueues nothing when the transaction loses the race (count 0)", async () => {
    setMeta(meta());
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 0 });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("sequential writers on a fake table get strictly increasing, distinct sequences", async () => {
    const row = { ...meta({ lastStatus: "queued", sequence: 1 }) } as Record<string, unknown>;
    prisma.apiMessageMeta.findUnique.mockImplementation(async (args: { select?: { sequence?: boolean } }) =>
      args.select?.sequence ? { sequence: row["sequence"] } : { ...row });
    prisma.apiMessageMeta.updateMany.mockImplementation(async (args: { where: { lastStatus: string | null }; data: { lastStatus: string } }) => {
      if (row["lastStatus"] !== args.where.lastStatus) return { count: 0 };
      row["lastStatus"] = args.data.lastStatus; row["sequence"] = (row["sequence"] as number) + 1;
      return { count: 1 };
    });
    await enqueueStatusCallback(P, "m1", "sent");
    await enqueueStatusCallback(P, "m1", "delivered");
    const seqs = add.mock.calls.map((c) => Number(c[1].fields.Sequence));
    expect(seqs).toEqual([2, 3]);
  });

  it("updates state but enqueues nothing when no callback URL is configured", async () => {
    setMeta(meta());
    prisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: null });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.apiMessageMeta.updateMany).toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("does nothing for a message without api metadata", async () => {
    setMeta(null);
    await enqueueStatusCallback(P, "ghost", "queued");
    expect(add).not.toHaveBeenCalled();
  });
});

describe("buildStatusFields", () => {
  it("formats times as 'YYYY-MM-DD HH:MM:SS.ffffff' and includes WhatsApp conversation fields when provided", () => {
    const f = buildStatusFields({
      messageId: "m1", from: "14155552671", to: "14155552672", status: "delivered", sequence: 3, errorCode: null,
      queuedAt: new Date("2026-10-05T10:00:00.123Z"), sentAt: new Date("2026-10-05T10:00:01.000Z"), deliveryReportAt: new Date("2026-10-05T10:00:05.500Z"),
      conversation: { id: "c1", origin: "service", expiration: 1790000000 },
    });
    expect(f).toMatchObject({
      MessageUUID: "m1", Status: "delivered", Sequence: "3", Units: "1", TotalRate: "0", TotalAmount: "0", MCC: "", MNC: "",
      MessageTime: "2026-10-05 10:00:00.123000", QueuedTime: "2026-10-05 10:00:00.123000", SentTime: "2026-10-05 10:00:01.000000",
      DeliveryReportTime: "2026-10-05 10:00:05.500000", ConversationID: "c1", ConversationOrigin: "service", ConversationExpirationTimestamp: "1790000000",
    });
  });
});
