import type { PrismaClient } from "@prisma/client";
import type { windowFor } from "./dashboard-range.js";

// Match the inbox/contacts lists: soft-deleted contacts (and their conversations/messages) are excluded.
const LIVE_CONTACT = { contact: { deletedAt: null } } as const;
const LIVE_CONV_MSG = { conversation: LIVE_CONTACT } as const;

export type DashWindow = ReturnType<typeof windowFor>;

export interface Kpi {
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
}

export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function kpi(value: number | null, previous: number | null): Kpi {
  return { value, previous, deltaPct: deltaPct(value, previous) };
}

// Average seconds from the first inbound to the first non-system outbound message,
// over conversations created in [start, end) that have both.
async function firstReplySecs(prisma: PrismaClient, organizationId: string, start: Date, end: Date): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ secs: number | null }[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (x.first_out - x.first_in)))::float AS secs
    FROM (
      SELECT m.conversation_id,
             MIN(m.created_at) FILTER (WHERE m.direction = 'inbound')  AS first_in,
             MIN(m.created_at) FILTER (WHERE m.direction = 'outbound') AS first_out
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN contacts ct ON ct.id = c.contact_id AND ct.deleted_at IS NULL
      WHERE m.organization_id = ${organizationId} AND m.is_system_message = false
        AND c.created_at >= ${start} AND c.created_at < ${end}
      GROUP BY m.conversation_id
    ) x
    WHERE x.first_in IS NOT NULL AND x.first_out IS NOT NULL AND x.first_out >= x.first_in`;
  const secs = rows[0]?.secs;
  return secs === null || secs === undefined || Number.isNaN(Number(secs)) ? null : Math.round(Number(secs));
}

export async function getDashboardKpis(
  prisma: PrismaClient,
  organizationId: string,
  w: DashWindow
): Promise<{
  openConversations: { value: number };
  newConversations: Kpi;
  newContacts: Kpi;
  messages: Kpi & { inbound: number; outbound: number };
  firstReplySecs: Kpi;
  campaignsSent: Kpi;
}> {
  const cur = { gte: w.start, lt: w.end };
  const prev = { gte: w.prevStart, lt: w.prevEnd };
  const msgWhere = (createdAt: { gte: Date; lt: Date }, direction?: "inbound" | "outbound") => ({
    organizationId,
    createdAt,
    isSystemMessage: false,
    ...(direction ? { direction } : {}),
    ...LIVE_CONV_MSG,
  });

  const [
    open, convCur, convPrev, contactCur, contactPrev,
    inbound, outbound, msgPrev, campCur, campPrev, replyCur, replyPrev,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, status: "open", ...LIVE_CONTACT } }),
    prisma.conversation.count({ where: { organizationId, createdAt: cur, ...LIVE_CONTACT } }),
    prisma.conversation.count({ where: { organizationId, createdAt: prev, ...LIVE_CONTACT } }),
    prisma.contact.count({ where: { organizationId, deletedAt: null, createdAt: cur } }),
    prisma.contact.count({ where: { organizationId, deletedAt: null, createdAt: prev } }),
    prisma.message.count({ where: msgWhere(cur, "inbound") }),
    prisma.message.count({ where: msgWhere(cur, "outbound") }),
    prisma.message.count({ where: msgWhere(prev) }),
    prisma.campaign.count({ where: { organizationId, status: "completed", sentAt: cur } }),
    prisma.campaign.count({ where: { organizationId, status: "completed", sentAt: prev } }),
    firstReplySecs(prisma, organizationId, w.start, w.end),
    firstReplySecs(prisma, organizationId, w.prevStart, w.prevEnd),
  ]);

  return {
    openConversations: { value: open },
    newConversations: kpi(convCur, convPrev),
    newContacts: kpi(contactCur, contactPrev),
    messages: { ...kpi(inbound + outbound, msgPrev), inbound, outbound },
    firstReplySecs: kpi(replyCur, replyPrev),
    campaignsSent: kpi(campCur, campPrev),
  };
}

export type AttentionKey = "unanswered" | "sla_at_risk" | "failed_messages" | "templates";

const UNANSWERED_AFTER_MS = 60 * 60_000;
const FAILED_WINDOW_MS = 24 * 3600_000;

async function countUnanswered(prisma: PrismaClient, organizationId: string, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - UNANSWERED_AFTER_MS);
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id AND ct.deleted_at IS NULL
    WHERE c.organization_id = ${organizationId}
      AND c.status IN ('open','pending')
      AND c.last_inbound_at IS NOT NULL AND c.last_inbound_at < ${threshold}
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id
                      AND m.direction = 'outbound' AND m.is_system_message = false
                      AND m.created_at > c.last_inbound_at)`;
  return Number(rows[0]?.n ?? 0);
}

async function countSlaAtRisk(prisma: PrismaClient, organizationId: string, now: Date): Promise<number> {
  const convs = await prisma.conversation.findMany({
    where: { organizationId, slaId: { not: null }, status: { in: ["open", "pending"] }, ...LIVE_CONTACT },
    select: { id: true, createdAt: true, sla: { select: { firstResponseSecs: true } } },
  });
  if (convs.length === 0) return 0;
  const replied = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      organizationId,
      conversationId: { in: convs.map((c) => c.id) },
      direction: "outbound",
      isSystemMessage: false,
    },
  });
  const repliedIds = new Set(replied.map((r) => r.conversationId));
  return convs.filter((c) => {
    if (!c.sla || repliedIds.has(c.id)) return false;
    return now.getTime() > c.createdAt.getTime() + c.sla.firstResponseSecs * 1000;
  }).length;
}

export async function getAttentionCounts(
  prisma: PrismaClient,
  organizationId: string,
  now: Date,
  want: Set<AttentionKey>
): Promise<Record<AttentionKey, number>> {
  const [unanswered, sla_at_risk, failed_messages, templates] = await Promise.all([
    want.has("unanswered") ? countUnanswered(prisma, organizationId, now) : 0,
    want.has("sla_at_risk") ? countSlaAtRisk(prisma, organizationId, now) : 0,
    want.has("failed_messages")
      ? prisma.message.count({
          where: {
            organizationId,
            direction: "outbound",
            status: { in: ["failed", "expired", "aborted"] },
            isSystemMessage: false,
            sentAt: { gte: new Date(now.getTime() - FAILED_WINDOW_MS) },
            ...LIVE_CONV_MSG,
          },
        })
      : 0,
    want.has("templates")
      ? prisma.template.count({
          where: { organizationId, status: { in: ["rejected", "paused", "flagged", "limit_exceeded", "disabled"] } },
        })
      : 0,
  ]);
  return { unanswered, sla_at_risk, failed_messages, templates };
}
