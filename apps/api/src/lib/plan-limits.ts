import type { PrismaClient } from "@prisma/client";

type LimitEntity =
  | "contacts"
  | "campaigns"
  | "chatbots"
  | "flows"
  | "custom_fields"
  | "team_members";

const SETTING_KEY: Record<LimitEntity, string> = {
  contacts: "plan_limit_contacts",
  campaigns: "plan_limit_campaigns",
  chatbots: "plan_limit_chatbots",
  flows: "plan_limit_flows",
  custom_fields: "plan_limit_custom_fields",
  team_members: "plan_limit_team_members",
};

async function countEntity(prisma: PrismaClient, entity: LimitEntity, organizationId: string): Promise<number> {
  switch (entity) {
    case "contacts":
      return prisma.contact.count({ where: { organizationId, deletedAt: null } });
    case "campaigns":
      return prisma.campaign.count({ where: { organizationId } });
    case "chatbots":
      return prisma.chatbot.count({ where: { organizationId } });
    case "flows":
      return prisma.flow.count({ where: { organizationId } });
    case "custom_fields":
      return prisma.contactCustomField.count({ where: { organizationId, isActive: true } });
    case "team_members":
      return prisma.user.count({ where: { organizationId, isActive: true } });
  }
}

// Returns allowed:true when under limit, or allowed:false when at/over limit.
// limit=-1 means unlimited (always allowed).
export async function checkPlanLimit(
  prisma: PrismaClient,
  organizationId: string,
  entity: LimitEntity
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const setting = await prisma.vendorSetting.findFirst({
    where: { organizationId, key: SETTING_KEY[entity] },
    select: { value: true },
  });

  const limit = parseInt(setting?.value ?? "-1", 10);
  if (isNaN(limit) || limit < 0) return { allowed: true, limit: -1, current: 0 };

  const current = await countEntity(prisma, entity, organizationId);
  return { allowed: current < limit, limit, current };
}
