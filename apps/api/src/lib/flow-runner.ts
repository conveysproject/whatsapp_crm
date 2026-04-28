import type { PrismaClient } from "@prisma/client";
import { sendTextMessage } from "./whatsapp.js";

export type TriggerType = "inbound_message" | "contact_tag_added" | "conversation_assigned";

export interface FlowNode {
  id: string;
  type: "send_message" | "update_stage" | "assign_conversation" | "add_tag" | "wait" | "end";
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

  let currentNodeId: string | null = flowDefinition.startNodeId;

  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;

    switch (node.type) {
      case "send_message": {
        const text = (node.config["text"] as string) ?? "";
        if (payload.contactPhone && text) {
          await sendTextMessage(
            process.env["WA_PHONE_NUMBER_ID"] ?? "",
            payload.contactPhone,
            text,
            process.env["WA_ACCESS_TOKEN"] ?? ""
          );
        }
        break;
      }
      case "update_stage": {
        const stage = node.config["lifecycleStage"] as string;
        if (stage && payload.contactPhone) {
          await prisma.contact.updateMany({
            where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
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
            where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
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
