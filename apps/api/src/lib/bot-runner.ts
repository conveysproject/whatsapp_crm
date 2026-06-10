import type { PrismaClient } from "@prisma/client";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";
import type { FlowDefinition, FlowNode } from "./flow-runner.js";

// GAP-S18: substitute WhatsApp bot tokens — built-in fields + all custom fields
function substituteTokens(
  text: string,
  contact: {
    firstName: string | null; lastName: string | null; name: string | null;
    phoneNumber: string; email: string | null;
    countryCode?: string | null; languageCode?: string | null;
    customFields?: Record<string, unknown>;
  } | null,
  assignedTeamMember?: string | null
): string {
  if (!contact) return text;
  let result = text
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, contact.name ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim())
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{phone_number\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "")
    .replace(/\{\{country\}\}/gi, contact.countryCode ?? "")
    .replace(/\{\{language_code\}\}/gi, contact.languageCode ?? "")
    .replace(/\{\{assigned_team_member\}\}/gi, assignedTeamMember ?? "");
  // Substitute all custom fields: {{field_key}} → value
  if (contact.customFields) {
    for (const [key, value] of Object.entries(contact.customFields)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "gi"), String(value ?? ""));
    }
  }
  return result;
}

export async function handleBotMessage(
  prisma: PrismaClient,
  conversationId: string,
  organizationId: string,
  inboundBody: string | null
): Promise<void> {
  const session = await prisma.botSession.findFirst({ where: { conversationId } });
  if (!session || session.isEscalated) return;

  const chatbot = await prisma.chatbot.findFirst({
    where: { id: session.chatbotId, isActive: true },
  });
  if (!chatbot) return;

  const flow = await prisma.flow.findFirst({ where: { id: chatbot.flowId } });
  if (!flow) return;

  const definition = flow.flowDefinition as unknown as FlowDefinition;
  const nodeMap = new Map<string, FlowNode>(definition.nodes.map((n) => [n.id, n]));
  const currentNodeId = session.currentNodeId ?? definition.startNodeId;
  const node = nodeMap.get(currentNodeId);
  if (!node) return;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  const phoneNumberId = org?.phoneNumberId ?? "";
  const accessToken = org?.wabaAccessToken ?? "";
  if (!phoneNumberId || !accessToken) return;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
    include: {
      contact: {
        select: {
          firstName: true, lastName: true, name: true, phoneNumber: true,
          email: true, countryCode: true, languageCode: true, customFields: true,
        },
      },
    },
  });
  const contactPhone = conversation?.whatsappContactId ?? "";
  const contact = conversation?.contact ?? null;

  // GAP-S18: look up assigned team member name for {assigned_team_member} token
  let assignedTeamMember: string | null = null;
  if (conversation?.assignedTo) {
    const assignedUser = await prisma.user.findUnique({
      where: { id: conversation.assignedTo },
      select: { fullName: true },
    });
    assignedTeamMember = assignedUser?.fullName ?? null;
  }

  if (node.type === "send_message") {
    const rawText = (node.config["text"] as string) ?? "";
    const text = substituteTokens(rawText, contact ? { ...contact, customFields: contact.customFields as Record<string, unknown> | undefined } : null, assignedTeamMember);
    if (text && contactPhone) {
      const { messageId } = await sendTextMessage(
        phoneNumberId,
        contactPhone,
        text,
        accessToken
      );
      await recordOutbound(prisma, { conversationId, organizationId, contentType: "text", body: text, whatsappMessageId: messageId });
    }
    await prisma.botSession.update({
      where: { id: session.id },
      data: { currentNodeId: node.next ?? null },
    });
  } else if (node.type === "end" || !node.next) {
    await prisma.botSession.update({ where: { id: session.id }, data: { isEscalated: true } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "open" } });
    if (contactPhone) {
      const escalationText = "You're now connected with a live agent. Please hold on.";
      const { messageId } = await sendTextMessage(
        process.env["WA_PHONE_NUMBER_ID"] ?? "",
        contactPhone,
        escalationText,
        process.env["WA_ACCESS_TOKEN"] ?? ""
      );
      await recordOutbound(prisma, { conversationId, organizationId, contentType: "text", body: escalationText, whatsappMessageId: messageId });
    }
  }

  void inboundBody;
}
