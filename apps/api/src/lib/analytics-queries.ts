import type { PrismaClient, CampaignRecipientStatus } from "@prisma/client";

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

export interface AgentStats {
  userId: string;
  displayName: string;
  openConversations: number;
  resolvedToday: number;
  avgFirstResponseSecs: number;
  slaBreaches: number;
}

export async function getTeamStats(
  prisma: PrismaClient,
  organizationId: string
): Promise<AgentStats[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const users = await prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, fullName: true },
  });
  const userIds = users.map((u) => u.id);

  const [openConvs, resolvedConvs, convs30d] = await Promise.all([
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: { in: userIds }, status: { in: ["open", "pending"] } },
      select: {
        assignedTo: true,
        createdAt: true,
        slaId: true,
        sla: { select: { firstResponseSecs: true } },
      },
    }),
    prisma.conversation.findMany({
      where: {
        organizationId,
        assignedTo: { in: userIds },
        status: "resolved",
        closedAt: { gte: startOfDay },
      },
      select: { assignedTo: true },
    }),
    prisma.conversation.findMany({
      where: { organizationId, assignedTo: { in: userIds }, createdAt: { gte: since30d } },
      select: { id: true, assignedTo: true, createdAt: true },
    }),
  ]);

  const conv30dIds = convs30d.map((c) => c.id);
  const convAssignMap = new Map(
    convs30d.map((c) => [c.id, { assignedTo: c.assignedTo, createdAt: c.createdAt }])
  );

  const firstOutbounds = await prisma.message.findMany({
    where: { conversationId: { in: conv30dIds }, direction: "outbound", isSystemMessage: false },
    select: { conversationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstByConv = new Map<string, Date>();
  for (const m of firstOutbounds) {
    if (!firstByConv.has(m.conversationId)) firstByConv.set(m.conversationId, m.createdAt);
  }

  const openCountByUser = new Map<string, number>();
  const slaBreachByUser = new Map<string, number>();
  for (const c of openConvs) {
    const uid = c.assignedTo!;
    openCountByUser.set(uid, (openCountByUser.get(uid) ?? 0) + 1);
    if (c.sla && c.createdAt.getTime() + c.sla.firstResponseSecs * 1000 < now.getTime()) {
      slaBreachByUser.set(uid, (slaBreachByUser.get(uid) ?? 0) + 1);
    }
  }

  const resolvedCountByUser = new Map<string, number>();
  for (const c of resolvedConvs) {
    const uid = c.assignedTo!;
    resolvedCountByUser.set(uid, (resolvedCountByUser.get(uid) ?? 0) + 1);
  }

  const responseTimesByUser = new Map<string, number[]>();
  for (const [convId, firstAt] of firstByConv.entries()) {
    const convData = convAssignMap.get(convId);
    if (!convData?.assignedTo) continue;
    const uid = convData.assignedTo;
    const secs = (firstAt.getTime() - convData.createdAt.getTime()) / 1000;
    if (!responseTimesByUser.has(uid)) responseTimesByUser.set(uid, []);
    responseTimesByUser.get(uid)!.push(secs);
  }

  return users.map((u) => {
    const times = responseTimesByUser.get(u.id) ?? [];
    const avg =
      times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    return {
      userId: u.id,
      displayName: u.fullName,
      openConversations: openCountByUser.get(u.id) ?? 0,
      resolvedToday: resolvedCountByUser.get(u.id) ?? 0,
      avgFirstResponseSecs: avg,
      slaBreaches: slaBreachByUser.get(u.id) ?? 0,
    };
  });
}

export interface CampaignSnapshotData {
  lastCampaign: {
    id: string;
    name: string;
    sentAt: string;
    totalSent: number;
    delivered: number;
    read: number;
    failed: number;
  } | null;
  nextScheduled: {
    id: string;
    name: string;
    scheduledAt: string;
    recipientCount: number;
  } | null;
}

export async function getCampaignSnapshot(
  prisma: PrismaClient,
  organizationId: string
): Promise<CampaignSnapshotData> {
  const now = new Date();

  const [lastCampaign, nextScheduled] = await Promise.all([
    prisma.campaign.findFirst({
      where: { organizationId, status: "completed" },
      orderBy: { sentAt: "desc" },
      select: { id: true, name: true, sentAt: true },
    }),
    prisma.campaign.findFirst({
      where: { organizationId, status: "scheduled", scheduledAt: { gte: now } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, name: true, scheduledAt: true, _count: { select: { recipients: true } } },
    }),
  ]);

  if (!lastCampaign) {
    return {
      lastCampaign: null,
      nextScheduled: nextScheduled
        ? {
            id: nextScheduled.id,
            name: nextScheduled.name,
            scheduledAt: nextScheduled.scheduledAt!.toISOString(),
            recipientCount: nextScheduled._count.recipients,
          }
        : null,
    };
  }

  const recipientCounts = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: lastCampaign.id },
    _count: { _all: true },
  });

  const countByStatus = new Map(recipientCounts.map((r) => [r.status, r._count._all]));
  const deliveredStatuses: CampaignRecipientStatus[] = ["delivered", "read", "played"];
  const delivered = deliveredStatuses.reduce((sum, s) => sum + (countByStatus.get(s) ?? 0), 0);
  const read = countByStatus.get("read") ?? 0;
  const failed = countByStatus.get("failed") ?? 0;
  const totalSent = [...countByStatus.values()].reduce((a, b) => a + b, 0);

  return {
    lastCampaign: {
      id: lastCampaign.id,
      name: lastCampaign.name,
      sentAt: lastCampaign.sentAt?.toISOString() ?? "",
      totalSent,
      delivered,
      read,
      failed,
    },
    nextScheduled: nextScheduled
      ? {
          id: nextScheduled.id,
          name: nextScheduled.name,
          scheduledAt: nextScheduled.scheduledAt!.toISOString(),
          recipientCount: nextScheduled._count.recipients,
        }
      : null,
  };
}

export interface ActivityEvent {
  type: "contact_created" | "campaign_sent" | "conversation_closed" | "member_joined";
  label: string;
  timestamp: string;
}

export async function getActivityFeed(
  prisma: PrismaClient,
  organizationId: string
): Promise<ActivityEvent[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [recentContacts, recentCampaigns, recentClosedConvs, recentMembers] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { name: true, firstName: true, lastName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.campaign.findMany({
      where: { organizationId, status: "completed", sentAt: { gte: since } },
      select: { name: true, sentAt: true },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    prisma.conversation.findMany({
      where: { organizationId, status: "resolved", closedAt: { gte: since } },
      select: { contact: { select: { name: true, firstName: true } }, closedAt: true },
      orderBy: { closedAt: "desc" },
      take: 5,
    }),
    prisma.user.findMany({
      where: { organizationId, createdAt: { gte: since }, isActive: true },
      select: { fullName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const events: ActivityEvent[] = [];

  for (const c of recentContacts) {
    const name = c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ") ?? "Unknown";
    events.push({ type: "contact_created", label: `New contact: ${name}`, timestamp: c.createdAt.toISOString() });
  }
  for (const c of recentCampaigns) {
    events.push({ type: "campaign_sent", label: `Campaign "${c.name}" sent`, timestamp: c.sentAt?.toISOString() ?? "" });
  }
  for (const c of recentClosedConvs) {
    const name = c.contact?.name ?? c.contact?.firstName ?? "Unknown";
    events.push({ type: "conversation_closed", label: `Conversation with ${name} resolved`, timestamp: c.closedAt?.toISOString() ?? "" });
  }
  for (const u of recentMembers) {
    events.push({ type: "member_joined", label: `${u.fullName} joined the team`, timestamp: u.createdAt.toISOString() });
  }

  return events
    .filter((e) => e.timestamp)
    .sort((a, b) => (b.timestamp < a.timestamp ? -1 : b.timestamp > a.timestamp ? 1 : 0))
    .slice(0, 10);
}

