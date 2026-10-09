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
