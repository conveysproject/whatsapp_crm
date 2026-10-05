import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const add = vi.fn();
vi.mock("./queues.js", () => ({ publicApiCallbackQueue: { add: (...a: unknown[]) => add(...a) }, publicApiSendQueue: { add: vi.fn() } }));
import { enqueueStatusCallback, buildStatusFields, forwardMetaStatusToApiClient, forwardInboundToApiClient } from "./callbacks.js";

const prisma = {
  $transaction: vi.fn(),
  apiMessageMeta: { findUnique: vi.fn(), updateMany: vi.fn() },
  apiKey: { findUnique: vi.fn(), findMany: vi.fn() },
  vendorSetting: { findFirst: vi.fn() },
  message: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

  it("S1: retries when a concurrent writer moved the row between read and CAS, and still reports the transition", async () => {
    // The route's 'queued' lands between the worker's read (lastStatus null) and its CAS: first CAS sees count 0.
    const row = { ...meta() } as Record<string, unknown>;
    prisma.apiMessageMeta.findUnique.mockImplementation(async (args: { select?: { sequence?: boolean } }) =>
      args.select?.sequence ? { sequence: row["sequence"] } : { ...row });
    let first = true;
    prisma.apiMessageMeta.updateMany.mockImplementation(async (args: { where: { lastStatus: string | null }; data: { lastStatus: string } }) => {
      if (first) { first = false; row["lastStatus"] = "queued"; row["sequence"] = 1; return { count: 0 }; }
      if (row["lastStatus"] !== args.where.lastStatus) return { count: 0 };
      row["lastStatus"] = args.data.lastStatus; row["sequence"] = (row["sequence"] as number) + 1;
      return { count: 1 };
    });
    await enqueueStatusCallback(P, "m1", "sent");
    expect(prisma.apiMessageMeta.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.apiMessageMeta.updateMany.mock.calls[1]![0].where).toMatchObject({ lastStatus: "queued" });
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "sent", Sequence: "2" });
  });

  it("S1: a retry re-checks the ratchet and drops a transition that became stale", async () => {
    let reads = 0;
    prisma.apiMessageMeta.findUnique.mockImplementation(async () => (reads++ === 0 ? meta({ lastStatus: "queued" }) : meta({ lastStatus: "delivered" })));
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 0 });
    await enqueueStatusCallback(P, "m1", "sent");
    expect(prisma.apiMessageMeta.updateMany).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  it("S1: gives up after 3 attempts", async () => {
    setMeta(meta());
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 0 });
    await enqueueStatusCallback(P, "m1", "queued");
    expect(prisma.apiMessageMeta.updateMany).toHaveBeenCalledTimes(3);
    expect(add).not.toHaveBeenCalled();
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

describe("forwardMetaStatusToApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    prisma.apiKey.findUnique.mockResolvedValue({ callbackUrl: "https://c.example.com/cb" });
    prisma.vendorSetting.findFirst.mockResolvedValue({ value: "14155552671" });
    prisma.apiMessageMeta.updateMany.mockResolvedValue({ count: 1 });
    prisma.message.findUnique.mockResolvedValue({ status: "sent" });
    prisma.message.update.mockResolvedValue({});
    prisma.message.updateMany.mockResolvedValue({ count: 1 });
  });

  it("ignores messages that were not sent through the API", async () => {
    setMeta(null);
    await forwardMetaStatusToApiClient(P, "m1", { status: "delivered" });
    expect(add).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("forwards delivered and read with Meta's conversation info", async () => {
    setMeta(meta({ lastStatus: "sent", sequence: 2 }));
    await forwardMetaStatusToApiClient(P, "m1", { status: "delivered", conversation: { id: "c9", origin: { type: "service" }, expiration_timestamp: "1790000000" } });
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "delivered", ConversationID: "c9", ConversationOrigin: "service", ConversationExpirationTimestamp: "1790000000" });
  });

  it("ignores Meta's 'sent' (the send worker already reported it)", async () => {
    setMeta(meta({ lastStatus: "sent" }));
    await forwardMetaStatusToApiClient(P, "m1", { status: "sent" });
    expect(add).not.toHaveBeenCalled();
  });

  it("failed after sent: marks the message failed, reports 'undelivered' with the mapped error code", async () => {
    setMeta(meta({ lastStatus: "sent" }));
    await forwardMetaStatusToApiClient(P, "m1", { status: "failed", errors: [{ code: 131047 }] });
    // S7: one conditional write, so a concurrent delivered/read can never be overwritten.
    expect(prisma.message.updateMany).toHaveBeenCalledWith({ where: { id: "m1", status: { notIn: ["delivered", "read"] } }, data: { status: "failed" } });
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(add.mock.calls[0]![1].fields).toMatchObject({ Status: "undelivered", ErrorCode: "380" });
  });

  it("failed before sent is reported as 'failed'", async () => {
    setMeta(meta({ lastStatus: "queued" }));
    await forwardMetaStatusToApiClient(P, "m1", { status: "failed" });
    expect(add.mock.calls[0]![1].fields.Status).toBe("failed");
  });

  it("does not overwrite delivered/read messages with failed", async () => {
    setMeta(meta({ lastStatus: "read" }));
    prisma.message.findUnique.mockResolvedValue({ status: "read" });
    await forwardMetaStatusToApiClient(P, "m1", { status: "failed" });
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});

describe("forwardInboundToApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.vendorSetting.findFirst.mockResolvedValue({ value: "+1 415-555-2671" });
  });

  it("queues one inbound callback per active credential with an inbound URL, scoped to the org", async () => {
    prisma.apiKey.findMany.mockResolvedValue([{ id: "k1", inboundUrl: "https://c.example.com/in" }, { id: "k2", inboundUrl: "https://d.example.com/in" }]);
    await forwardInboundToApiClient(P, { organizationId: "org-1", messageId: "m9", fromPhone: "14155552672", text: "hello" });
    expect(prisma.apiKey.findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: "org-1", revokedAt: null, inboundUrl: { not: null } });
    expect(add).toHaveBeenCalledTimes(2);
    const [name, data] = add.mock.calls[0]!;
    expect(name).toBe("inbound");
    expect(data).toMatchObject({ apiKeyId: "k1", organizationId: "org-1", url: "https://c.example.com/in", method: "POST", fields: { From: "14155552672", To: "14155552671", Text: "hello", Type: "whatsapp", MessageUUID: "m9" } });
  });

  it("sends an empty Text for non-text messages and does nothing without credentials", async () => {
    prisma.apiKey.findMany.mockResolvedValue([{ id: "k1", inboundUrl: "https://c.example.com/in" }]);
    await forwardInboundToApiClient(P, { organizationId: "org-1", messageId: "m9", fromPhone: "1", text: null });
    expect(add.mock.calls[0]![1].fields.Text).toBe("");
    add.mockClear();
    prisma.apiKey.findMany.mockResolvedValue([]);
    await forwardInboundToApiClient(P, { organizationId: "org-1", messageId: "m9", fromPhone: "1", text: "x" });
    expect(add).not.toHaveBeenCalled();
  });
});
