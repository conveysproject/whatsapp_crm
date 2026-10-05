import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { getIo } from "../lib/io-ref.js";
import { enqueueStatusCallback } from "../lib/public-api/callbacks.js";
import { plivoErrorFromMeta } from "../lib/public-api/meta-errors.js";
import { inferMediaKind } from "../lib/public-api/send-mapping.js";
import { safeErr } from "../lib/public-api/safe-err.js";
import type { SendJob } from "../lib/public-api/queues.js";
import {
  sendTextMessage, sendMediaMessage, sendTemplateMessage, sendInteractiveMessage, sendLocationMessage, WaApiError,
} from "../lib/whatsapp.js";

async function fail(messageId: string, organizationId: string, errorCode: string | null): Promise<void> {
  await prisma.message.update({ where: { id: messageId, organizationId }, data: { status: "failed" } });
  await enqueueStatusCallback(prisma, messageId, "failed", { errorCode });
}

export async function processSendJob(job: Pick<Job<SendJob>, "data">): Promise<void> {
  const { messageId, organizationId, to, content } = job.data;

  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId },
    select: { id: true, status: true, conversationId: true },
  });
  if (!message) return; // not ours
  if (message.status === "expired") {
    // The live stuck-message sweep (message-cleanup.ts) expires `sending` rows older than 5 minutes. The message was
    // never sent: report it failed so the client can resend (the status ratchet makes a repeat a no-op).
    await enqueueStatusCallback(prisma, messageId, "failed", { errorCode: null });
    return;
  }
  if (message.status !== "sending") return; // already handled

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  if (!org?.phoneNumberId || !org.wabaAccessToken) return fail(messageId, organizationId, "310");
  const { phoneNumberId, wabaAccessToken: token } = org;

  let wamid: string;
  try {
    switch (content.kind) {
      case "text": ({ messageId: wamid } = await sendTextMessage(phoneNumberId, to, content.text, token)); break;
      case "media": ({ messageId: wamid } = await sendMediaMessage(phoneNumberId, to, inferMediaKind(content.mediaUrl), content.mediaUrl, content.caption ?? undefined, token)); break;
      case "template": ({ messageId: wamid } = await sendTemplateMessage(phoneNumberId, to, content.name, content.language, content.components, token)); break;
      case "location": ({ messageId: wamid } = await sendLocationMessage(phoneNumberId, to, content, token)); break;
      case "interactive": ({ messageId: wamid } = await sendInteractiveMessage(phoneNumberId, to, content.interactive, token)); break;
    }
  } catch (err) {
    return fail(messageId, organizationId, err instanceof WaApiError ? plivoErrorFromMeta(err.metaCode) : null);
  }

  const sentAt = new Date();
  await prisma.message.update({ where: { id: messageId, organizationId }, data: { status: "sent", whatsappMessageId: wamid, sentAt } });
  // The client-visible `sent` callback goes first; the inbox refresh below is cosmetic and must not suppress it.
  await enqueueStatusCallback(prisma, messageId, "sent");
  try {
    await prisma.conversation.update({ where: { id: message.conversationId }, data: { lastMessageAt: sentAt } });
    getIo()?.to(`org:${organizationId}`).emit("new-message", { conversationId: message.conversationId, organizationId, direction: "outbound", sentAt: sentAt.toISOString() });
  } catch (err) {
    console.error("[public-api-send] inbox refresh after send failed", { messageId, ...safeErr(err) });
  }
}

/**
 * Worker `failed` handler. With `maxStalledCount: 0` a job whose worker died mid-send (deploy, crash) is FAILED by
 * BullMQ ("job stalled more than allowable limit") instead of re-run, so it never reaches `processSendJob` again.
 * Meta may or may not have accepted it; at-most-once is preferred, so a message still `sending` is reported failed.
 * Never throws.
 */
export async function handleSendJobFailed(job: Pick<Job<SendJob>, "id" | "data"> | undefined, err: Error): Promise<void> {
  console.error("[public-api-send] job failed", { jobId: job?.id, ...safeErr(err) });
  if (!job || !/stalled/i.test(err.message)) return;
  const { messageId, organizationId } = job.data;
  try {
    const message = await prisma.message.findFirst({ where: { id: messageId, organizationId }, select: { status: true } });
    if (!message) return;
    let failed = message.status === "expired";
    if (message.status === "sending") {
      const res = await prisma.message.updateMany({ where: { id: messageId, organizationId, status: "sending" }, data: { status: "failed" } });
      failed = res.count > 0;
    }
    if (failed) await enqueueStatusCallback(prisma, messageId, "failed", { errorCode: null });
  } catch (cleanupErr) {
    console.error("[public-api-send] stalled-job cleanup failed", { messageId, ...safeErr(cleanupErr) });
  }
}

export const SEND_WORKER_CONCURRENCY = 20;

export function startPublicApiSendWorker() {
  const worker = new Worker<SendJob>("public-api-send", processSendJob, {
    connection: redisConnection,
    concurrency: SEND_WORKER_CONCURRENCY,
    // A stalled send must never be re-run: it may already have reached Meta (double-send). See handleSendJobFailed.
    maxStalledCount: 0,
  });
  worker.on("error", (err) => console.error("[public-api-send] worker error", safeErr(err)));
  worker.on("failed", (job, err) => { void handleSendJobFailed(job, err); });
  return worker;
}
