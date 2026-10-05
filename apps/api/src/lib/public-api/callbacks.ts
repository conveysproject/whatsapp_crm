import type { PrismaClient } from "@prisma/client";
import { publicApiCallbackQueue } from "./queues.js";
import { plivoErrorFromMeta } from "./meta-errors.js";

export type PlivoStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered";

const RANK: Record<PlivoStatus, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, undelivered: 4 };

function canAdvance(last: string | null, next: PlivoStatus): boolean {
  if (last === null) return true;
  const lastRank = RANK[last as PlivoStatus];
  if (lastRank === undefined) return false;
  if (next === "failed" || next === "undelivered") return lastRank < RANK.delivered;
  return lastRank < 4 && RANK[next] > lastRank;
}

function plivoTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}000`;
}

export interface StatusFieldArgs {
  messageId: string; from: string; to: string; status: PlivoStatus; sequence: number; errorCode: string | null;
  queuedAt: Date; sentAt: Date | null; deliveryReportAt: Date | null;
  conversation?: { id?: string; origin?: string; expiration?: number };
}

/**
 * Plivo status-callback fields. Units/TotalRate/TotalAmount/MCC/MNC have no Meta source (Q4): static placeholders.
 * ConversationID/Origin/ExpirationTimestamp are only sent when Meta's status webhook supplied them.
 */
export function buildStatusFields(a: StatusFieldArgs): Record<string, string> {
  return {
    MessageUUID: a.messageId, To: a.to, From: a.from, Type: "whatsapp", Status: a.status,
    Units: "1", TotalRate: "0", TotalAmount: "0", MCC: "", MNC: "",
    ...((a.status === "failed" || a.status === "undelivered") && a.errorCode ? { ErrorCode: a.errorCode } : {}),
    Sequence: String(a.sequence),
    MessageTime: plivoTime(a.queuedAt), QueuedTime: plivoTime(a.queuedAt),
    ...(a.sentAt ? { SentTime: plivoTime(a.sentAt) } : {}),
    ...(a.deliveryReportAt ? { DeliveryReportTime: plivoTime(a.deliveryReportAt) } : {}),
    ...(a.conversation?.id ? { ConversationID: a.conversation.id } : {}),
    ...(a.conversation?.origin ? { ConversationOrigin: a.conversation.origin } : {}),
    ...(a.conversation?.expiration ? { ConversationExpirationTimestamp: String(a.conversation.expiration) } : {}),
  };
}

export async function businessNumberDigits(prisma: PrismaClient, organizationId: string): Promise<string> {
  const row = await prisma.vendorSetting.findFirst({ where: { organizationId, key: "current_phone_number_number" }, select: { value: true } });
  return (row?.value ?? "").replace(/\D/g, "");
}

/** Ratchet the message's API-visible status and queue the callback. Safe to call repeatedly and concurrently. */
export async function enqueueStatusCallback(
  prisma: PrismaClient,
  messageId: string,
  next: PlivoStatus,
  extra: { errorCode?: string | null; conversation?: { id?: string; origin?: string; expiration?: number } } = {}
): Promise<void> {
  const meta = await prisma.apiMessageMeta.findUnique({ where: { messageId } });
  if (!meta || !canAdvance(meta.lastStatus, next)) return;

  const now = new Date();
  const terminal = next === "delivered" || next === "read" || next === "failed" || next === "undelivered";
  // Conditional update + read-back in one transaction: the winning updateMany holds the row lock until commit,
  // so the read sees this writer's own incremented sequence (never a stale or duplicate value).
  const sequence = await prisma.$transaction(async (tx) => {
    const won = await tx.apiMessageMeta.updateMany({
      where: { messageId, lastStatus: meta.lastStatus },
      data: {
        lastStatus: next,
        sequence: { increment: 1 },
        ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
        ...(next === "sent" ? { sentAt: now } : {}),
        ...(terminal ? { deliveryReportAt: now } : {}),
      },
    });
    if (won.count === 0) return null;
    const row = await tx.apiMessageMeta.findUnique({ where: { messageId }, select: { sequence: true } });
    return row?.sequence ?? null;
  });
  if (sequence === null) return;

  const key = await prisma.apiKey.findUnique({ where: { id: meta.apiKeyId }, select: { callbackUrl: true } });
  const url = meta.callbackUrl ?? key?.callbackUrl ?? null;
  if (!url) return;

  const from = await businessNumberDigits(prisma, meta.organizationId);
  const fields = buildStatusFields({
    messageId, from, to: meta.dst, status: next, sequence,
    errorCode: extra.errorCode ?? meta.errorCode,
    queuedAt: meta.queuedAt, sentAt: next === "sent" ? now : meta.sentAt, deliveryReportAt: terminal ? now : meta.deliveryReportAt,
    ...(extra.conversation ? { conversation: extra.conversation } : {}),
  });
  await publicApiCallbackQueue.add("status", {
    apiKeyId: meta.apiKeyId, organizationId: meta.organizationId, url,
    method: meta.callbackMethod === "GET" ? "GET" : "POST", fields,
  });
}

export interface MetaStatusUpdate {
  status: string;
  errors?: Array<{ code?: number }>;
  conversation?: { id?: string; origin?: { type?: string }; expiration_timestamp?: string | number };
}

/**
 * Called from the Meta status webhook for every status update. A no-op unless the message was sent through the
 * public API, so dashboard messages are untouched. Meta's `sent` is ignored: the send worker already reported it.
 */
export async function forwardMetaStatusToApiClient(prisma: PrismaClient, messageId: string, su: MetaStatusUpdate): Promise<void> {
  const meta = await prisma.apiMessageMeta.findUnique({ where: { messageId }, select: { messageId: true, lastStatus: true } });
  if (!meta) return;

  const conversation = su.conversation
    ? {
        ...(su.conversation.id ? { id: su.conversation.id } : {}),
        ...(su.conversation.origin?.type ? { origin: su.conversation.origin.type } : {}),
        ...(su.conversation.expiration_timestamp ? { expiration: Number(su.conversation.expiration_timestamp) } : {}),
      }
    : undefined;

  if (su.status === "delivered" || su.status === "read") {
    await enqueueStatusCallback(prisma, messageId, su.status, conversation ? { conversation } : {});
    return;
  }
  if (su.status === "failed") {
    if (!canAdvance(meta.lastStatus, "failed")) return;
    const current = await prisma.message.findUnique({ where: { id: messageId }, select: { status: true } });
    if (current && current.status !== "delivered" && current.status !== "read") {
      await prisma.message.update({ where: { id: messageId }, data: { status: "failed" } });
    }
    const next: PlivoStatus = meta.lastStatus === "sent" ? "undelivered" : "failed";
    await enqueueStatusCallback(prisma, messageId, next, { errorCode: plivoErrorFromMeta(su.errors?.[0]?.code) });
  }
}
