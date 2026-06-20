import type { PrismaClient } from "@prisma/client";
import {
  sendTextMessage,
  sendMediaMessage,
  sendInteractiveMessage,
  sendTemplateMessage,
  type WaInteractivePayload,
  type WaTemplateComponent,
} from "./whatsapp.js";
import { resumeFlowQueue } from "./queue.js";
import { recordOutbound } from "./record-outbound.js";

function substituteVariables(
  text: string,
  contact: { firstName: string | null; lastName: string | null; name: string | null; phoneNumber: string; email: string | null } | null
): string {
  if (!contact) return text;
  const fullName = contact.name ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim();
  return text
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

export type TriggerType =
  | "inbound_message"
  | "new_conversation"
  | "keyword_match"
  | "button_reply"
  | "contact_created"
  | "tag_added"
  | "lifecycle_change"
  | "conversation_resolved"
  | "conversation_assigned"
  | "no_reply";

export interface FlowNode {
  id: string;
  type:
    | "send_message" | "send_text"
    | "send_media" | "send_image" | "send_video" | "send_document"
    | "send_interactive" | "send_buttons" | "send_list"
    | "send_template"
    | "cta_url"
    | "ask_question"
    | "update_stage"
    | "assign_conversation" | "assign_agent"
    | "add_tag" | "add_label"
    | "remove_tag" | "remove_label"
    | "opt_in" | "opt_out"
    | "toggle_bot"
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
  contactId?: string;
  resumeFromNodeId?: string;
}

export interface FlowSession {
  flowId: string;
  flowRunId: string;
  waitingAtNodeId: string;
  waitingNodeType?: string;
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
      conversationId: payload.conversationId || null,
      status: "running",
    },
  });

  const nodeMap = new Map<string, FlowNode>(flowDefinition.nodes.map((n) => [n.id, n]));
  console.log(`[flow-runner] flowId=${flowId} nodes=${JSON.stringify(flowDefinition.nodes.map((n) => ({ id: n.id, type: n.type, next: n.next })))}`);

  const org = await prisma.organization.findUnique({
    where: { id: payload.organizationId },
    select: { phoneNumberId: true, wabaAccessToken: true },
  });
  const phoneNumberId = org?.phoneNumberId ?? "";
  const accessToken = org?.wabaAccessToken ?? "";

  const contact = payload.contactPhone
    ? await prisma.contact.findFirst({
        where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
        select: { firstName: true, lastName: true, name: true, phoneNumber: true, email: true },
      })
    : null;

  const startId = payload.resumeFromNodeId ?? flowDefinition.startNodeId;
  let currentNodeId: string | null = startId;
  let stepsExecuted = 0;

  try {
    while (currentNodeId) {
      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      let resolvedNext: string | null = node.next;

      switch (node.type) {
        case "send_message":
        case "send_text": {
          const text = substituteVariables((node.config["text"] as string) ?? "", contact);
          if (payload.contactPhone && text) {
            const { messageId } = await sendTextMessage(phoneNumberId, payload.contactPhone, text, accessToken);
            if (payload.conversationId) {
              await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "text", body: text, whatsappMessageId: messageId });
            }
          }
          break;
        }

        case "send_media":
        case "send_image":
        case "send_video":
        case "send_document": {
          const mediaId = (node.config["mediaId"] as string) ?? (node.config["url"] as string) ?? "";
          const contentType = (node.config["contentType"] as string) ?? node.type.replace("send_", "") ?? "image";
          const rawCaption = node.config["caption"] as string | undefined;
          const caption = rawCaption ? substituteVariables(rawCaption, contact) : undefined;
          if (payload.contactPhone && mediaId) {
            const { messageId } = await sendMediaMessage(phoneNumberId, payload.contactPhone, contentType, mediaId, caption, accessToken);
            if (payload.conversationId) {
              await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType, body: caption ?? null, mediaUrl: mediaId, whatsappMessageId: messageId });
            }
          }
          break;
        }

        case "send_interactive":
        case "send_buttons": {
          console.log(`[flow-runner] send_buttons node=${node.id} resuming=${payload.resumeFromNodeId === node.id} waitForReply=${node.config["waitForReply"]} convId=${payload.conversationId}`);
          if (payload.resumeFromNodeId !== node.id) {
            const rawInteractive = (node.config["interactive"] as WaInteractivePayload | undefined)
              ?? buildButtonsInteractive(node.config);
            const interactive = rawInteractive?.body?.text
              ? { ...rawInteractive, body: { ...rawInteractive.body, text: substituteVariables(rawInteractive.body.text, contact) } }
              : rawInteractive;
            if (payload.contactPhone && interactive) {
              const { messageId } = await sendInteractiveMessage(phoneNumberId, payload.contactPhone, interactive, accessToken);
              if (payload.conversationId) {
                const recordedBody = interactive.body?.text || "[Select an option]";
                await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "interactive", body: recordedBody, whatsappMessageId: messageId });
              }
            }
            if (node.config["waitForReply"] !== false && payload.conversationId) {
              await writeFlowSession(prisma, payload.conversationId, flowId, run.id, node.id, node.type);
              await prisma.flowRun.update({
                where: { id: run.id },
                data: { status: "waiting", currentNodeId: node.id, stepsExecuted },
              });
              return;
            }
          } else {
            // Resume: extract button ID from JSON body (webhook stores {button_reply:{id,title}})
            // then translate id → button text so downstream conditions can match display text
            const buttons = node.config["buttons"] as Array<{ id: string; text: string }> | undefined;
            let buttonId = payload.messageBody ?? "";
            try {
              const parsed = JSON.parse(buttonId) as { button_reply?: { id?: string } };
              const extractedId = parsed.button_reply?.id;
              if (extractedId) buttonId = extractedId;
            } catch { /* plain ID string — no change */ }
            const matched = buttons?.find((b) => b.id === buttonId);
            if (matched) payload = { ...payload, messageBody: matched.text };
          }
          break;
        }

        case "send_list": {
          if (payload.resumeFromNodeId !== node.id) {
            const listConfig = typeof node.config["body"] === "string"
              ? { ...node.config, body: substituteVariables(node.config["body"], contact) }
              : node.config;
            const listInteractive = buildListInteractive(listConfig);
            if (payload.contactPhone && listInteractive) {
              const { messageId } = await sendInteractiveMessage(phoneNumberId, payload.contactPhone, listInteractive, accessToken);
              if (payload.conversationId) {
                await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "interactive", body: listInteractive.body?.text ?? null, whatsappMessageId: messageId });
              }
            }
            if (node.config["waitForReply"] !== false && payload.conversationId) {
              await writeFlowSession(prisma, payload.conversationId, flowId, run.id, node.id, node.type);
              await prisma.flowRun.update({
                where: { id: run.id },
                data: { status: "waiting", currentNodeId: node.id, stepsExecuted },
              });
              return;
            }
          } else {
            // Resume: translate list row ID → item title so conditions can match display text
            const sections = node.config["sections"] as Array<{ rows: Array<{ id: string; title: string }> }> | undefined;
            const items = node.config["items"] as Array<{ title: string }> | undefined;
            const allRows: Array<{ id: string; title: string }> = sections?.flatMap((s) => s.rows) ??
              (items?.map((item, i) => ({ id: `row_${i}`, title: item.title })) ?? []);
            const matchedRow = allRows.find((r) => r.id === payload.messageBody);
            if (matchedRow) payload = { ...payload, messageBody: matchedRow.title };
          }
          break;
        }

        case "send_template": {
          const templateName = (node.config["templateName"] as string) ?? "";
          const languageCode = (node.config["languageCode"] as string) ?? "en";
          const components = ((node.config["components"] as WaTemplateComponent[]) ?? []);
          if (payload.contactPhone && templateName) {
            const { messageId } = await sendTemplateMessage(phoneNumberId, payload.contactPhone, templateName, languageCode, components, accessToken);
            if (payload.conversationId) {
              await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "template", body: templateName, whatsappMessageId: messageId });
            }
          }
          break;
        }

        case "cta_url": {
          const ctaBody = substituteVariables((node.config["body"] as string) ?? "", contact);
          const buttonText = (node.config["buttonText"] as string) ?? "";
          const url = (node.config["url"] as string) ?? "";
          if (payload.contactPhone && ctaBody && url) {
            const ctaInteractive: WaInteractivePayload = {
              type: "cta_url",
              body: { text: ctaBody },
              action: { name: "cta_url", parameters: { display_text: buttonText, url } },
            };
            const { messageId } = await sendInteractiveMessage(phoneNumberId, payload.contactPhone, ctaInteractive, accessToken);
            if (payload.conversationId) {
              await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "interactive", body: ctaBody, whatsappMessageId: messageId });
            }
          }
          break;
        }

        case "ask_question": {
          const isResuming = payload.resumeFromNodeId === node.id;
          if (isResuming) {
            // Flow resumed here — contact just replied. Save reply to contact field if configured.
            const saveToField = node.config["saveToField"] as string | undefined;
            const reply = payload.messageBody ?? "";
            if (saveToField && reply && payload.contactPhone) {
              const allowedFields: Record<string, string> = {
                firstName: "firstName", lastName: "lastName", email: "email", notes: "notes",
              };
              const field = allowedFields[saveToField];
              if (field) {
                await prisma.contact.updateMany({
                  where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
                  data: { [field]: reply },
                });
              }
            }
            break;
          }
          const question = substituteVariables((node.config["question"] as string) ?? "", contact);
          if (payload.contactPhone && question) {
            const { messageId } = await sendTextMessage(phoneNumberId, payload.contactPhone, question, accessToken);
            if (payload.conversationId) {
              await recordOutbound(prisma, { conversationId: payload.conversationId, organizationId: payload.organizationId, contentType: "text", body: question, whatsappMessageId: messageId });
            }
          }
          if (payload.conversationId) {
            await writeFlowSession(prisma, payload.conversationId, flowId, run.id, node.id, node.type);
            await prisma.flowRun.update({
              where: { id: run.id },
              data: { status: "waiting", currentNodeId: node.id, stepsExecuted },
            });
            return;
          }
          break;
        }

        case "wait": {
          const duration = Number(node.config["duration"] ?? 1);
          const unit = (node.config["unit"] as string) ?? "hours";
          const multipliers: Record<string, number> = { minutes: 60000, hours: 3600000, days: 86400000 };
          const delayMs = duration * (multipliers[unit] ?? 3600000);
          if (node.next) {
            await resumeFlowQueue.add(
              "resume-flow",
              { flowId, payload: { ...payload, resumeFromNodeId: node.next } },
              { delay: delayMs, jobId: `resume-${run.id}` }
            );
            await prisma.flowRun.update({
              where: { id: run.id },
              data: { status: "waiting", currentNodeId: node.id, stepsExecuted },
            });
          }
          return;
        }

        case "update_stage": {
          const leadStatusId = node.config["leadStatusId"] as string | undefined;
          if (leadStatusId && payload.contactPhone) {
            await prisma.contact.updateMany({
              where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
              data: { leadStatusId },
            });
          }
          break;
        }

        case "assign_conversation":
        case "assign_agent": {
          const assignTo = (node.config["assignTo"] as string) ?? "";
          if (assignTo && payload.conversationId) {
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
              await prisma.contact.update({ where: { id: contact.id }, data: { tags: { push: tag } } });
            }
          }
          break;
        }

        case "remove_tag":
        case "remove_label": {
          const tag = (node.config["tag"] as string) ?? "";
          if (tag && payload.contactPhone) {
            const contact = await prisma.contact.findFirst({
              where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
            });
            if (contact) {
              await prisma.contact.update({
                where: { id: contact.id },
                data: { tags: contact.tags.filter((t) => t !== tag) },
              });
            }
          }
          break;
        }

        case "opt_in": {
          if (payload.contactPhone) {
            await prisma.contact.updateMany({
              where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
              data: { whatsappOptOut: false },
            });
          }
          break;
        }

        case "opt_out": {
          if (payload.contactPhone) {
            await prisma.contact.updateMany({
              where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
              data: { whatsappOptOut: true },
            });
          }
          break;
        }

        case "toggle_bot": {
          const action = (node.config["botState"] as string) ?? (node.config["action"] as string) ?? "disable";
          if (payload.contactPhone) {
            await prisma.contact.updateMany({
              where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
              data: { disableBot: action === "disable" },
            });
          }
          break;
        }

        case "close_conversation": {
          if (payload.conversationId) {
            await prisma.conversation.update({
              where: { id: payload.conversationId },
              data: { status: "resolved" },
            });
          }
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
          console.log(`[flow-runner] condition node=${node.id} type=${conditionType} value=${JSON.stringify(value)} body=${JSON.stringify(messageBody)} matched=${matched} next=${matched ? node.next : (node.nextNo ?? null)}`);
          resolvedNext = matched ? node.next : (node.nextNo ?? null);
          break;
        }

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

async function writeFlowSession(
  prisma: PrismaClient,
  conversationId: string,
  flowId: string,
  flowRunId: string,
  waitingAtNodeId: string,
  waitingNodeType: string
): Promise<void> {
  const session: FlowSession = { flowId, flowRunId, waitingAtNodeId, waitingNodeType };
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { flowSession: session as object },
  });
}

function buildButtonsInteractive(config: Record<string, unknown>): WaInteractivePayload | null {
  const body = (config["body"] as string | undefined) ?? "";
  const buttons = config["buttons"] as Array<{ id: string; text: string }> | undefined;
  if (!body || !buttons?.length) return null;
  return {
    type: "button",
    body: { text: body },
    action: {
      buttons: buttons.map((btn) => ({ type: "reply", reply: { id: btn.id, title: btn.text } })),
    },
  };
}

function buildListInteractive(config: Record<string, unknown>): WaInteractivePayload | null {
  const bodyText = (config["body"] as string | undefined) ?? " ";
  // Legacy format: sections array
  const sections = config["sections"] as Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> | undefined;
  if (sections?.length) {
    const buttonText = (config["buttonText"] as string) ?? "Select";
    return { type: "list", body: { text: bodyText }, action: { button: buttonText, sections } };
  }
  // Builder format: items array + header as button label
  const items = config["items"] as Array<{ title: string; description?: string }> | undefined;
  if (items?.length) {
    const buttonText = (config["header"] as string) ?? "Select";
    return {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: [{
          title: "",
          rows: items.map((item, i) => ({ id: `row_${i}`, title: item.title, description: item.description ?? undefined })),
        }],
      },
    };
  }
  return null;
}
