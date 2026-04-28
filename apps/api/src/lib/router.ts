import type { PrismaClient } from "@prisma/client";

interface RoutingCondition {
  field: "tags" | "status" | "channelType";
  operator: "equals" | "contains";
  value: string;
}

interface ConversationContext {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  channelType: string;
}

export async function evaluateRoutingRules(
  prisma: PrismaClient,
  conversation: ConversationContext
): Promise<{ assignTo: string; assignType: string } | null> {
  const rules = await prisma.routingRule.findMany({
    where: { organizationId: conversation.organizationId, isActive: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    const conditions = rule.conditions as unknown as RoutingCondition[];
    let matches = true;

    for (const cond of conditions) {
      if (cond.field === "channelType" && cond.operator === "equals") {
        if (conversation.channelType !== cond.value) { matches = false; break; }
      } else if (cond.field === "status" && cond.operator === "equals") {
        if (conversation.status !== cond.value) { matches = false; break; }
      }
    }

    if (matches) {
      return { assignTo: rule.assignTo, assignType: rule.assignType };
    }
  }

  return null;
}
