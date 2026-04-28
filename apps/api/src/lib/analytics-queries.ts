import type { PrismaClient } from "@prisma/client";

export interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
}

export interface DailyVolume {
  date: string;
  inbound: number;
  outbound: number;
}

export interface AgentPerformance {
  assignedTo: string;
  conversationsHandled: number;
}

export async function getOverviewMetrics(
  prisma: PrismaClient,
  organizationId: string
): Promise<OverviewMetrics> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [openConversations, totalContacts, messagesToday, pendingInvitations] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "open" } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.message.count({
      where: { organizationId, createdAt: { gte: startOfDay } },
    }),
    prisma.invitation.count({ where: { organizationId, status: "pending" } }),
  ]);

  return { openConversations, totalContacts, messagesToday, pendingInvitations };
}

export async function getConversationVolume(
  prisma: PrismaClient,
  organizationId: string,
  days = 14
): Promise<DailyVolume[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const messages = await prisma.message.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { direction: true, createdAt: true },
  });

  const buckets: Record<string, { inbound: number; outbound: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0]!;
    buckets[key] = { inbound: 0, outbound: 0 };
  }

  for (const msg of messages) {
    const key = msg.createdAt.toISOString().split("T")[0]!;
    if (buckets[key]) {
      if (msg.direction === "inbound") buckets[key]!.inbound++;
      else buckets[key]!.outbound++;
    }
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

export async function getTeamPerformance(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentPerformance[]> {
  const conversations = await prisma.conversation.findMany({
    where: { organizationId, assignedTo: { not: null } },
    select: { assignedTo: true },
  });

  const counts: Record<string, number> = {};
  for (const c of conversations) {
    if (c.assignedTo) counts[c.assignedTo] = (counts[c.assignedTo] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([assignedTo, conversationsHandled]) => ({ assignedTo, conversationsHandled }));
}
