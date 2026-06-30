import type { PrismaClient } from "@prisma/client";
import { getIo } from "./io-ref.js";

interface RecordOutboundArgs {
  conversationId: string;
  organizationId: string;
  contentType: string;
  body: string | null;
  richContent?: object | null;
  mediaUrl?: string | null;
  whatsappMessageId?: string | null;
}

export async function recordOutbound(prisma: PrismaClient, args: RecordOutboundArgs): Promise<void> {
  const sentAt = new Date();
  await prisma.message.create({
    data: {
      conversationId: args.conversationId,
      organizationId: args.organizationId,
      direction: "outbound",
      contentType: args.contentType,
      body: args.body ?? null,
      richContent: args.richContent ?? undefined,
      mediaUrl: args.mediaUrl ?? null,
      whatsappMessageId: args.whatsappMessageId ?? null,
      status: "sent",
      sentAt,
    },
  });
  await prisma.conversation.update({
    where: { id: args.conversationId },
    data: { lastMessageAt: sentAt },
  });
  getIo()?.to(`org:${args.organizationId}`).emit("new-message", {
    conversationId: args.conversationId,
    organizationId: args.organizationId,
    direction: "outbound",
    body: args.body,
    sentAt: sentAt.toISOString(),
  });
}
