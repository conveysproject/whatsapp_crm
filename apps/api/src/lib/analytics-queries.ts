import type { PrismaClient } from "@prisma/client";

export interface OverviewMetrics {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  pendingInvitations: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
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

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    openConversations,
    totalContacts,
    messagesToday,
    pendingInvitations,
    campaignsSentThisMonth,
    botConversations,
    outboundMsgs,
    convs30d,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "open" } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.message.count({ where: { organizationId, createdAt: { gte: startOfDay } } }),
    prisma.invitation.count({ where: { organizationId, status: "pending" } }),
    prisma.campaign.count({
      where: { organizationId, status: "completed", sentAt: { gte: startOfMonth } },
    }),
    prisma.conversation.count({
      where: { organizationId, status: "bot", lastMessageAt: { gte: startOfDay } },
    }),
    prisma.message.findMany({
      where: { organizationId, direction: "outbound", isSystemMessage: false, createdAt: { gte: since30d } },
      select: { conversationId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.conversation.findMany({
      where: { organizationId, createdAt: { gte: since30d } },
      select: { id: true, createdAt: true },
    }),
  ]);

  // Avg first response time (org-wide, last 30 days)
  const firstByConv = new Map<string, Date>();
  for (const m of outboundMsgs) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }
  const convCreatedMap = new Map(convs30d.map((c) => [c.id, c.createdAt]));
  let totalSecs = 0;
  let responseCount = 0;
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convCreated = convCreatedMap.get(convId);
    if (convCreated) {
      totalSecs += (firstAt.getTime() - convCreated.getTime()) / 1000;
      responseCount++;
    }
  }
  const avgFirstResponseTime = responseCount > 0 ? Math.round(totalSecs / responseCount) : 0;

  return {
    openConversations,
    totalContacts,
    messagesToday,
    pendingInvitations,
    campaignsSentThisMonth,
    avgFirstResponseTime,
    botConversations,
  };
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

export interface ConversationPreview {
  id: string;
  contactName: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MyWorkData {
  assignedOpen: number;
  unreadCount: number;
  assignedContacts: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
  topConversations: ConversationPreview[];
}

export async function getMyWork(
  prisma: PrismaClient,
  organizationId: string,
  userId: string
): Promise<MyWorkData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [assignedConvs, assignedContacts, resolvedToday] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: userId, status: { in: ["open", "pending"] } },
      select: {
        id: true,
        unreadCount: true,
        lastMessageAt: true,
        createdAt: true,
        slaId: true,
        sla: { select: { firstResponseSecs: true } },
        contact: { select: { name: true, firstName: true, lastName: true } },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.contact.count({ where: { organizationId, assignedUserId: userId } }),
    prisma.conversation.count({
      where: {
        organizationId,
        assignedTo: userId,
        status: "resolved",
        closedAt: { gte: startOfDay },
      },
    }),
  ]);

  const top3Ids = assignedConvs.slice(0, 3).map((c) => c.id);
  const lastMessages = await prisma.message.findMany({
    where: { conversationId: { in: top3Ids }, isSystemMessage: false },
    select: { conversationId: true, body: true, contentType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const lastMsgByConv = new Map<string, (typeof lastMessages)[0]>();
  for (const m of lastMessages) {
    if (!lastMsgByConv.has(m.conversationId)) lastMsgByConv.set(m.conversationId, m);
  }

  const convs30d = await prisma.conversation.findMany({
    where: { organizationId, assignedTo: userId, createdAt: { gte: since30d } },
    select: { id: true, createdAt: true },
  });
  const firstOutbounds = await prisma.message.findMany({
    where: {
      conversationId: { in: convs30d.map((c) => c.id) },
      direction: "outbound",
      isSystemMessage: false,
    },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstByConv = new Map<string, Date>();
  for (const m of firstOutbounds) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }
  const convCreatedMap = new Map(convs30d.map((c) => [c.id, c.createdAt]));
  let totalSecs = 0;
  let responseCount = 0;
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convCreated = convCreatedMap.get(convId);
    if (convCreated) {
      totalSecs += (firstAt.getTime() - convCreated.getTime()) / 1000;
      responseCount++;
    }
  }

  const slaBreaches = assignedConvs.filter(
    (c) => c.sla && c.createdAt.getTime() + c.sla.firstResponseSecs * 1000 < now.getTime()
  ).length;

  const topConversations: ConversationPreview[] = assignedConvs.slice(0, 3).map((c) => {
    const contact = c.contact;
    const contactName =
      contact?.name ??
      [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ??
      "Unknown";
    const lastMsg = lastMsgByConv.get(c.id);
    let preview = "[Media]";
    if (lastMsg?.body) preview = lastMsg.body.slice(0, 60);
    else if (lastMsg?.contentType === "image") preview = "[Image]";
    else if (lastMsg?.contentType === "audio") preview = "[Audio]";
    return {
      id: c.id,
      contactName,
      lastMessagePreview: preview,
      lastMessageAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
      unreadCount: c.unreadCount,
    };
  });

  return {
    assignedOpen: assignedConvs.length,
    unreadCount: assignedConvs.reduce((sum, c) => sum + c.unreadCount, 0),
    assignedContacts,
    resolvedToday,
    avgFirstResponseSecs: responseCount > 0 ? Math.round(totalSecs / responseCount) : 0,
    slaBreaches,
    topConversations,
  };
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
