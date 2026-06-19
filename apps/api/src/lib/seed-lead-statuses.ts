import type { PrismaClient } from "@prisma/client";

export const SEED_LEAD_STATUSES: { name: string; color: string; sortOrder: number; isClosure: boolean }[] = [
  { name: "New Lead",       color: "#F97316", sortOrder: 0, isClosure: false },
  { name: "Qualification",  color: "#22C55E", sortOrder: 1, isClosure: false },
  { name: "Needs Analysis", color: "#3B82F6", sortOrder: 2, isClosure: false },
  { name: "Proposal",       color: "#EC4899", sortOrder: 3, isClosure: false },
  { name: "Negotiation",    color: "#8B5CF6", sortOrder: 4, isClosure: false },
  { name: "Closed Won",     color: "#10B981", sortOrder: 5, isClosure: true },
  { name: "Closed Lost",    color: "#EF4444", sortOrder: 6, isClosure: true },
];

// Idempotent: seeds the 7 default lead statuses only if the org has none yet.
export async function seedLeadStatuses(prisma: PrismaClient, organizationId: string): Promise<void> {
  const existing = await prisma.leadStatus.count({ where: { organizationId } });
  if (existing > 0) return;
  await prisma.leadStatus.createMany({
    data: SEED_LEAD_STATUSES.map((s) => ({ organizationId, ...s })),
  });
}
