import type { PrismaClient } from "@prisma/client";

export interface SegmentFilter {
  field: "lifecycleStage" | "tags" | "createdAt";
  operator: "equals" | "contains" | "before" | "after";
  value: string;
}

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: SegmentFilter[]
): Promise<string[]> {
  const andClauses: Record<string, unknown>[] = [{ organizationId }];

  for (const filter of filters) {
    if (filter.field === "lifecycleStage" && filter.operator === "equals") {
      andClauses.push({ lifecycleStage: filter.value });
    } else if (filter.field === "tags" && filter.operator === "contains") {
      andClauses.push({ tags: { has: filter.value } });
    } else if (filter.field === "createdAt" && filter.operator === "after") {
      andClauses.push({ createdAt: { gte: new Date(filter.value) } });
    } else if (filter.field === "createdAt" && filter.operator === "before") {
      andClauses.push({ createdAt: { lte: new Date(filter.value) } });
    }
  }

  const contacts = await prisma.contact.findMany({
    where: { AND: andClauses },
    select: { id: true, phoneNumber: true },
  });

  return contacts.map((c) => c.phoneNumber);
}
