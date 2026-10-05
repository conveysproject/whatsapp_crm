import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { getIo } from "../lib/io-ref.js";
import { enqueueStatusCallback } from "../lib/public-api/callbacks.js";
import { plivoErrorFromMeta } from "../lib/public-api/meta-errors.js";
import { inferMediaKind } from "../lib/public-api/send-mapping.js";
import type { SendJob } from "../lib/public-api/queues.js";
import {
  sendTextMessage, sendMediaMessage, sendTemplateMessage, sendInteractiveMessage, sendLocationMessage, WaApiError,
} from "../lib/whatsapp.js";

async function fail(messageId: string, errorCode: string | null): Promise<void> {
  await prisma.message.update({ where: { id: messageId }, data: { status: "failed" } });
  await enqueueStatusCallback(prisma, messageId, "failed", { errorCode });
}

export async function processSendJob(job: Pick<Job<SendJob>, "data">): Promise<void> {
  const { messageId, organizationId, to, content } = job.data;

  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId },
    select: { id: true, status: true, conversationId: true },
  });
  if (!message || message.status !== "sending") return; // already handled, expired, or not ours

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  if (!org?.phoneNumberId || !org.wabaAccessToken) return fail(messageId, "310");
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
    return fail(messageId, err instanceof WaApiError ? plivoErrorFromMeta(err.metaCode) : null);
  }

  const sentAt = new Date();
  await prisma.message.update({ where: { id: messageId }, data: { status: "sent", whatsappMessageId: wamid, sentAt } });
  await prisma.conversation.update({ where: { id: message.conversationId }, data: { lastMessageAt: sentAt } });
  getIo()?.to(`org:${organizationId}`).emit("new-message", { conversationId: message.conversationId, organizationId, direction: "outbound", sentAt: sentAt.toISOString() });
  await enqueueStatusCallback(prisma, messageId, "sent");
}

export function startPublicApiSendWorker() {
  const worker = new Worker<SendJob>("public-api-send", processSendJob, { connection: redisConnection, concurrency: 5 });
  worker.on("error", (err) => console.error(`[public-api-send] worker error: ${err.message}`));
  worker.on("failed", (job, err) => console.error(`[public-api-send] job ${job?.id} failed: ${err.message}`));
  return worker;
}
