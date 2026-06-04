import type { PrismaClient } from "@prisma/client";
import { flowQueue, noReplyQueue } from "./queue.js";
import type { FlowTriggerPayload, FlowDefinition } from "./flow-runner.js";

export type TriggerType =
  | "new_conversation"
  | "inbound_message"
  | "keyword_match"
  | "button_reply"
  | "contact_created"
  | "tag_added"
  | "lifecycle_change"
  | "conversation_resolved"
  | "conversation_assigned"
  | "no_reply";

export interface DispatchPayload {
  conversationId?: string;
  organizationId: string;
  contactPhone?: string;
  messageBody?: string;
  contentType?: string;
  contactId?: string;
}

function matchesKeyword(
  body: string,
  keyword: string,
  matchType: string
): boolean {
  const b = body.toLowerCase();
  const k = keyword.toLowerCase();
  switch (matchType) {
    case "exact":        return b === k;
    case "starts_with":  return b.startsWith(k);
    case "ends_with":    return b.endsWith(k);
    case "contains_word": return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u").test(b);
    case "contains":
    default:             return b.includes(k);
  }
}

function getTriggerNodeConfig(
  flowDefinition: unknown
): Record<string, unknown> {
  const def = flowDefinition as FlowDefinition | null;
  if (!def?.nodes?.length) return {};
  const startNode = def.nodes.find((n) => n.id === def.startNodeId) ?? def.nodes[0];
  return startNode?.config ?? {};
}

export async function dispatchFlowTrigger(
  prisma: PrismaClient,
  organizationId: string,
  triggerType: TriggerType,
  payload: DispatchPayload
): Promise<void> {
  if (triggerType === "no_reply") {
    await scheduleNoReplyFlows(prisma, organizationId, payload);
    return;
  }

  const flows = await prisma.flow.findMany({
    where: { organizationId, isActive: true, triggerType },
    select: { id: true, flowDefinition: true },
  });
  console.log(`[flow-dispatch] trigger=${triggerType} org=${organizationId} found=${flows.length}`);

  for (const flow of flows) {
    if (triggerType === "keyword_match") {
      const config = getTriggerNodeConfig(flow.flowDefinition);
      const keyword = (config["keyword"] as string) ?? "";
      const matchType = (config["matchType"] as string) ?? "contains";
      if (!keyword || !matchesKeyword(payload.messageBody ?? "", keyword, matchType)) continue;
    }

    if (triggerType === "button_reply") {
      if (payload.contentType !== "interactive") continue;
      const config = getTriggerNodeConfig(flow.flowDefinition);
      const buttonText = (config["buttonText"] as string) ?? "";
      // Require an explicit buttonText filter — flows without one would catch ALL button
      // replies (e.g. CSAT Response Handler would fire on every interactive message)
      if (!buttonText) continue;
      if ((payload.messageBody ?? "").toLowerCase() !== buttonText.toLowerCase()) continue;
    }

    const jobPayload: FlowTriggerPayload = {
      conversationId: payload.conversationId ?? "",
      organizationId,
      contactPhone: payload.contactPhone,
      messageBody: payload.messageBody,
      contactId: payload.contactId,
    };
    // jobId deduplicates: same flow can't be queued twice for the same conversation
    // within the same second (covers inbound_message + keyword_match both matching)
    const epoch = Math.floor(Date.now() / 1000);
    const jobId = `flow-${flow.id}-${payload.conversationId ?? organizationId}-${epoch}`;
    await flowQueue.add("trigger-flow", { flowId: flow.id, payload: jobPayload }, { jobId });
  }
}

async function scheduleNoReplyFlows(
  prisma: PrismaClient,
  organizationId: string,
  payload: DispatchPayload
): Promise<void> {
  if (!payload.conversationId) return;
  const flows = await prisma.flow.findMany({
    where: { organizationId, isActive: true, triggerType: "no_reply" },
    select: { id: true, flowDefinition: true },
  });

  for (const flow of flows) {
    const config = getTriggerNodeConfig(flow.flowDefinition);
    const hours = Number(config["hours"] ?? 1);
    const delayMs = hours * 3600 * 1000;
    const jobId = `no-reply-${payload.conversationId}-${flow.id}`;
    await noReplyQueue.add(
      "check-no-reply",
      {
        flowId: flow.id,
        conversationId: payload.conversationId,
        organizationId,
        contactPhone: payload.contactPhone,
        scheduledAt: new Date().toISOString(),
      },
      { delay: delayMs, jobId }
    );
  }
}

export async function cancelNoReplyJobs(
  conversationId: string
): Promise<void> {
  // BullMQ: get job by known ID pattern and remove if still waiting
  const jobs = await noReplyQueue.getJobs(["delayed", "waiting"]);
  const toRemove = jobs.filter((j) =>
    (j.id ?? "").startsWith(`no-reply-${conversationId}-`)
  );
  await Promise.all(toRemove.map((j) => j.remove()));
}
