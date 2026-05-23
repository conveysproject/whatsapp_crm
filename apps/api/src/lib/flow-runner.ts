import type { PrismaClient } from "@prisma/client";
import { sendTextMessage, sendMediaMessage, sendInteractiveMessage, type WaInteractivePayload } from "./whatsapp.js";
import { phoneVariants } from "./phone-normalize.js";

export type TriggerType = "inbound_message" | "contact_tag_added" | "conversation_assigned";

export interface FlowNode {
  id: string;
  type: "send_message" | "send_media" | "send_interactive" | "update_stage" | "assign_conversation" | "add_tag" | "wait" | "end";
  config: Record<string, unknown>;
  next: string | null;
}

export interface FlowDefinition {
  startNodeId: string;
  nodes: FlowNode[];
}

export interface FlowTriggerPayload {
  conversationId: string;
  organizationId: string;
  contactPhone?: string;
  messageBody?: string;
}

export async function runFlow(
  prisma: PrismaClient,
  flowDefinition: FlowDefinition,
  payload: FlowTriggerPayload
): Promise<void> {
  const nodeMap = new Map<string, FlowNode>(
    flowDefinition.nodes.map((n) => [n.id, n])
  );

  // Fetch org credentials once for all send nodes
  const org = await prisma.organization.findUnique({
    where: { id: payload.organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
  const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";

  let currentNodeId: string | null = flowDefinition.startNodeId;

  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;

    switch (node.type) {
      case "send_message": {
        const text = (node.config["text"] as string) ?? "";
        if (payload.contactPhone && text) {
          await sendTextMessage(phoneNumberId, payload.contactPhone, text, accessToken);
        }
        break;
      }
      case "send_media": {
        const mediaId = node.config["mediaId"] as string;
        const contentType = (node.config["contentType"] as string) ?? "image";
        const caption = node.config["caption"] as string | undefined;
        if (payload.contactPhone && mediaId) {
          await sendMediaMessage(phoneNumberId, payload.contactPhone, contentType, mediaId, caption, accessToken);
        }
        break;
      }
      case "send_interactive": {
        const interactive = node.config["interactive"] as WaInteractivePayload | undefined;
        if (payload.contactPhone && interactive) {
          await sendInteractiveMessage(phoneNumberId, payload.contactPhone, interactive, accessToken);
        }
        break;
      }
      case "update_stage": {
        const stage = node.config["lifecycleStage"] as string;
        if (stage && payload.contactPhone) {
          await prisma.contact.updateMany({
            where: { organizationId: payload.organizationId, phoneNumber: { in: phoneVariants(payload.contactPhone) } },
            data: { lifecycleStage: stage as "lead" | "prospect" | "customer" | "loyal" | "churned" },
          });
        }
        break;
      }
      case "assign_conversation": {
        const assignTo = node.config["assignTo"] as string;
        if (assignTo) {
          await prisma.conversation.update({
            where: { id: payload.conversationId },
            data: { assignedTo: assignTo },
          });
        }
        break;
      }
      case "add_tag": {
        const tag = node.config["tag"] as string;
        if (tag && payload.contactPhone) {
          const contact = await prisma.contact.findFirst({
            where: { organizationId: payload.organizationId, phoneNumber: { in: phoneVariants(payload.contactPhone) } },
          });
          if (contact && !contact.tags.includes(tag)) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { tags: { push: tag } },
            });
          }
        }
        break;
      }
      case "wait":
        break;
      case "end":
        return;
    }

    currentNodeId = node.next;
  }
}
