import type { PrismaClient } from "@prisma/client";

const DEFAULT_STAGES = [
  "New Lead",
  "Qualification",
  "Needs Analysis",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

// Idempotent: creates the default Sales Pipeline only if the org has no pipelines yet.
export async function seedDefaultPipeline(prisma: PrismaClient, organizationId: string): Promise<void> {
  const existing = await prisma.pipeline.count({ where: { organizationId } });
  if (existing > 0) return;
  await prisma.pipeline.create({
    data: { organizationId, name: "Sales Pipeline", stages: DEFAULT_STAGES },
  });
}
