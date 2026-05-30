import type { PrismaClient } from "@prisma/client";
import { sendTextMessage, sendMediaMessage, sendInteractiveMessage, type WaInteractivePayload } from "./whatsapp.js";

export type TriggerType = "inbound_message" | "contact_tag_added" | "conversation_assigned";

export interface FlowNode {
  id: string;
  type:
    | "send_message" | "send_text"
    | "send_media" | "send_image" | "send_video" | "send_document"
    | "send_interactive" | "send_buttons" | "send_list"
    | "ask_question"
    | "update_stage"
    | "assign_conversation" | "assign_agent"
    | "add_tag" | "add_label"
    | "close_conversation"
    | "condition"
    | "wait"
    | "end";
  config: Record<string, unknown>;
  next: string | null;
  nextNo?: string | null;
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
  flowId: string,
  flowDefinition: FlowDefinition,
  payload: FlowTriggerPayload
): Promise<void> {
  const run = await prisma.flowRun.create({
    data: {
      organizationId: payload.organizationId,
      flowId,
      contactPhone: payload.contactPhone ?? null,
      conversationId: payload.conversationId,
      status: "running",
    },
  });

  const nodeMap = new Map<string, FlowNode>(flowDefinition.nodes.map((n) => [n.id, n]));

  const org = await prisma.organization.findUnique({
    where: { id: payload.organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  const phoneNumberId = org?.phoneNumberId ?? process.env["WA_PHONE_NUMBER_ID"] ?? "";
  const accessToken = org?.wabaAccessToken ?? process.env["WA_ACCESS_TOKEN"] ?? "";

  let currentNodeId: string | null = flowDefinition.startNodeId;
  let stepsExecuted = 0;

  try {
    while (currentNodeId) {
      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      let resolvedNext: string | null = node.next;

      switch (node.type) {
        case "send_message":
        case "send_text": {
          const text = (node.config["text"] as string) ?? "";
          if (payload.contactPhone && text) {
            await sendTextMessage(phoneNumberId, payload.contactPhone, text, accessToken);
          }
          break;
        }
        case "send_media":
        case "send_image":
        case "send_video":
        case "send_document": {
          const mediaId = (node.config["mediaId"] as string) ?? (node.config["url"] as string) ?? "";
          const contentType = (node.config["contentType"] as string) ?? node.type.replace("send_", "") ?? "image";
          const caption = node.config["caption"] as string | undefined;
          if (payload.contactPhone && mediaId) {
            await sendMediaMessage(phoneNumberId, payload.contactPhone, contentType, mediaId, caption, accessToken);
          }
          break;
        }
        case "send_interactive":
        case "send_buttons": {
          const interactive = node.config["interactive"] as WaInteractivePayload | undefined;
          if (payload.contactPhone && interactive) {
            await sendInteractiveMessage(phoneNumberId, payload.contactPhone, interactive, accessToken);
          }
          break;
        }
        case "send_list":
        case "ask_question":
          break;
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
        case "assign_conversation":
        case "assign_agent": {
          const assignTo = (node.config["assignTo"] as string) ?? "";
          if (assignTo) {
            await prisma.conversation.update({
              where: { id: payload.conversationId },
              data: { assignedTo: assignTo },
            });
          }
          break;
        }
        case "add_tag":
        case "add_label": {
          const tag = (node.config["tag"] as string) ?? "";
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
        case "close_conversation": {
          await prisma.conversation.update({
            where: { id: payload.conversationId },
            data: { status: "closed" },
          });
          break;
        }
        case "condition": {
          const conditionType = (node.config["conditionType"] as string) ?? "contains";
          const value = ((node.config["value"] as string) ?? "").toLowerCase();
          const messageBody = (payload.messageBody ?? "").toLowerCase();
          let matched = false;
          if (conditionType === "contains") matched = messageBody.includes(value);
          else if (conditionType === "is") matched = messageBody === value;
          else if (conditionType === "starts_with") matched = messageBody.startsWith(value);
          else if (conditionType === "ends_with") matched = messageBody.endsWith(value);
          resolvedNext = matched ? node.next : (node.nextNo ?? null);
          break;
        }
        case "wait":
          break;
        case "end":
          await prisma.flowRun.update({
            where: { id: run.id },
            data: { status: "completed", stepsExecuted, completedAt: new Date() },
          });
          return;
      }

      stepsExecuted++;
      currentNodeId = resolvedNext;
    }

    await prisma.flowRun.update({
      where: { id: run.id },
      data: { status: "completed", stepsExecuted, completedAt: new Date() },
    });
  } catch (err) {
    await prisma.flowRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        stepsExecuted,
        error: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}
