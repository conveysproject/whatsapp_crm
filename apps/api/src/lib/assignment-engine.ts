import type { PrismaClient } from "@prisma/client";

export type AssignmentTrigger = "contact_created" | "trait_tag_updated";

export interface AssignmentCondition {
  kind: "field" | "tags";
  field?: string;
  operator: string;
  value: string;
}

interface EvalContact {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  leadStatusId?: string | null;
  countryCode?: string | null;
  languageCode?: string | null;
  tags?: string[];
}

// Pure: AND of all conditions. Empty conditions => always match.
export function evaluateConditions(contact: EvalContact, conditions: AssignmentCondition[]): boolean {
  return conditions.every((c) => {
    if (c.kind === "tags") {
      const has = (contact.tags ?? []).includes(c.value);
      return c.operator === "notHas" ? !has : has;
    }
    const raw = (contact as Record<string, unknown>)[c.field ?? ""];
    const a = String(raw ?? "").toLowerCase();
    const b = String(c.value ?? "").toLowerCase();
    if (c.operator === "contains") return a.includes(b);
    if (c.operator === "isNot") return a !== b;
    return a === b; // equals
  });
}

export async function pickWorkloadBalancedAgent(prisma: PrismaClient, organizationId: string, teamId?: string): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: { organizationId, role: "agent", isActive: true, ...(teamId ? { teamId } : {}) },
    select: { id: true },
  });
  if (agents.length === 0) return null;
  const agentIds = agents.map((a) => a.id);
  const grouped = await prisma.contact.groupBy({
    by: ["assignedUserId"],
    where: { organizationId, deletedAt: null, assignedUserId: { in: agentIds } },
    _count: { _all: true },
  });
  const counts = new Map<string, number>(agentIds.map((id) => [id, 0]));
  for (const g of grouped) {
    if (g.assignedUserId) counts.set(g.assignedUserId, g._count._all);
  }
  let best = agentIds[0];
  let bestCount = counts.get(best) ?? 0;
  for (const id of agentIds) {
    const c = counts.get(id) ?? 0;
    if (c < bestCount) { best = id; bestCount = c; }
  }
  return best;
}

async function fallbackEnabled(prisma: PrismaClient, organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
  return (((org?.settings as Record<string, unknown> | null)?.["contactConfig"] as { assignmentFallbackEnabled?: boolean } | undefined)?.assignmentFallbackEnabled) === true;
}

export async function applyAssignmentRules(
  prisma: PrismaClient,
  organizationId: string,
  contactId: string,
  trigger: AssignmentTrigger,
): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true, organizationId: true, assignedUserId: true,
      firstName: true, lastName: true, email: true, phoneNumber: true,
      leadStatusId: true, countryCode: true, languageCode: true, tags: true,
    },
  });
  if (!contact || contact.organizationId !== organizationId) return;

  const rules = await prisma.contactAssignmentRule.findMany({
    where: { organizationId, trigger, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const rule of rules) {
    if (!evaluateConditions(contact, rule.conditions as unknown as AssignmentCondition[])) continue;
    // First matching rule wins.
    if (contact.assignedUserId && !rule.replacePrevious) return; // matched but must not overwrite
    let assignee: string | null = null;
    if (rule.assignType === "team") {
      assignee = await pickWorkloadBalancedAgent(prisma, organizationId, rule.assignTo ?? undefined);
    } else {
      const u = await prisma.user.findFirst({ where: { id: rule.assignTo, organizationId, isActive: true }, select: { id: true } });
      assignee = u?.id ?? null;
    }
    if (assignee) {
      await prisma.contact.update({ where: { id: contact.id }, data: { assignedUserId: assignee } });
    }
    return;
  }

  // Fallback: only for newly created contacts with no owner, when enabled.
  if (trigger === "contact_created" && !contact.assignedUserId && (await fallbackEnabled(prisma, organizationId))) {
    const agent = await pickWorkloadBalancedAgent(prisma, organizationId);
    if (agent) {
      await prisma.contact.update({ where: { id: contact.id }, data: { assignedUserId: agent } });
    }
  }
}
