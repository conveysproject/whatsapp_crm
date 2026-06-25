import type { PrismaClient } from "@prisma/client";
import { matchIntentToAutomation, type IntentCandidate } from "./claude.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";
import { runFlow, type FlowDefinition } from "./flow-runner.js";

const CONFIDENCE_THRESHOLD = 0.7;
const MAX_CANDIDATES = 30;

function interpolate(
  body: string,
  contact: { firstName: string | null; lastName: string | null; phoneNumber: string; email: string | null } | null
): string {
  if (!contact) return body;
  const fullName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return body
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

export async function runIntentMatching(
  prisma: PrismaClient,
  organizationId: string,
  messageBody: string,
  conversationId: string,
  contactPhone: string,
  org: { phoneNumberId: string; wabaAccessToken: string }
): Promise<void> {
  const settings = await prisma.orgAutomationSettings.findUnique({
    where: { organizationId },
    select: { intentMatchingEnabled: true, intentMatchCostPaise: true },
  });
  if (!settings?.intentMatchingEnabled) return;

  const [autoReplies, flows] = await Promise.all([
    prisma.autoReply.findMany({
      where: { organizationId, isActive: true },
      orderBy: { priorityIndex: "asc" },
      select: { id: true, name: true, triggerKeyword: true, replyText: true, flowId: true },
    }),
    prisma.flow.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, flowDefinition: true },
    }),
  ]);

  const candidates: IntentCandidate[] = [
    ...autoReplies.map((ar) => ({
      id: ar.id,
      type: "auto_reply" as const,
      name: ar.name,
      keyword: ar.triggerKeyword,
      preview: ar.replyText.slice(0, 120),
    })),
    ...flows.map((f) => ({
      id: f.id,
      type: "flow" as const,
      name: f.name,
      keyword: "",
      preview: f.name,
    })),
  ].slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) return;

  const result = await matchIntentToAutomation(messageBody, candidates);
  if (!result.matchedId || result.confidence < CONFIDENCE_THRESHOLD) return;

  if (result.matchType === "auto_reply") {
    const matched = autoReplies.find((ar) => ar.id === result.matchedId);
    if (!matched) return;

    const contact = await prisma.contact.findFirst({
      where: { organizationId, phoneNumber: contactPhone },
      select: { firstName: true, lastName: true, phoneNumber: true, email: true },
    });

    const replyText = interpolate(matched.replyText, contact);
    if (replyText) {
      const { messageId } = await sendTextMessage(
        org.phoneNumberId, contactPhone, replyText, org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId,
        organizationId,
        contentType: "text",
        body: replyText,
        whatsappMessageId: messageId,
      });
    }

    if (matched.flowId) {
      const flow = await prisma.flow.findFirst({
        where: { id: matched.flowId, isActive: true },
      });
      if (flow) {
        await runFlow(
          prisma,
          flow.id,
          flow.flowDefinition as unknown as FlowDefinition,
          { conversationId, organizationId, contactPhone, messageBody }
        );
      }
    }
  } else if (result.matchType === "flow") {
    const flow = await prisma.flow.findFirst({
      where: { id: result.matchedId, isActive: true },
    });
    if (flow) {
      await runFlow(
        prisma,
        flow.id,
        flow.flowDefinition as unknown as FlowDefinition,
        { conversationId, organizationId, contactPhone, messageBody }
      );
    }
  }

  await prisma.creditLedger.create({
    data: {
      organizationId,
      credits: BigInt(-settings.intentMatchCostPaise),
      type: "intent_match",
      notes: `${result.matchType}:${result.matchedId}`,
    },
  });
}
