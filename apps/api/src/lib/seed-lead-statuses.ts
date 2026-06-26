import type { PrismaClient } from "@prisma/client";

export const SEED_LEAD_STATUSES: { name: string; color: string; sortOrder: number }[] = [
  { name: "New Lead",       color: "#F97316", sortOrder: 0 },
  { name: "Qualification",  color: "#22C55E", sortOrder: 1 },
  { name: "Needs Analysis", color: "#3B82F6", sortOrder: 2 },
  { name: "Proposal",       color: "#EC4899", sortOrder: 3 },
  { name: "Negotiation",    color: "#8B5CF6", sortOrder: 4 },
  { name: "Closed Won",     color: "#10B981", sortOrder: 5 },
  { name: "Closed Lost",    color: "#EF4444", sortOrder: 6 },
];

const CLOSURE_NAMES = ["Closed Won", "Closed Lost"];

// Idempotent: seeds the 7 default lead statuses only if the org has none yet.
// Also writes the two closure statuses into org contactConfig.closureLeadStatusIds.
export async function seedLeadStatuses(prisma: PrismaClient, organizationId: string): Promise<void> {
  const existing = await prisma.leadStatus.count({ where: { organizationId } });
  if (existing > 0) return;
  await prisma.leadStatus.createMany({
    data: SEED_LEAD_STATUSES.map((s) => ({ organizationId, ...s })),
  });
  const closureStatuses = await prisma.leadStatus.findMany({
    where: { organizationId, name: { in: CLOSURE_NAMES } },
    select: { id: true },
  });
  if (closureStatuses.length > 0) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const existingSettings = (org?.settings as Record<string, unknown>) ?? {};
    const existingConfig = (existingSettings["contactConfig"] as Record<string, unknown>) ?? {};
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...existingSettings,
          contactConfig: { ...existingConfig, closureLeadStatusIds: closureStatuses.map((s) => s.id) },
        },
      },
    });
  }
}
