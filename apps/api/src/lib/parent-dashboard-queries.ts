import type { PrismaClient } from "@prisma/client";
import { getChildOrgIds, isChildOf } from "./parent-orgs.js";

/**
 * Parent-side reads over child organizations. Child ids come ONLY from getChildOrgIds /
 * isChildOf; callers never pass org ids from a request.
 *
 * Counting rules are not new: they are the existing ones, applied to many orgs at once.
 *  - messages are non-system and belong to a live (not soft-deleted) contact, as in
 *    lib/dashboard-queries.ts (getDashboardKpis);
 *  - the outbound funnel (sent / delivered / read / failed) uses the cumulative status
 *    definitions of lib/template-analytics.ts: sent = sent+delivered+read,
 *    delivered = delivered+read, read = read, failed = failed+expired+aborted;
 *  - received = inbound non-system messages (dashboard "inbound").
 * Time window is on created_at in [from, to), like the dashboard.
 */

export class ChildNotFoundError extends Error {
  constructor() {
    super("CHILD_NOT_FOUND");
    this.name = "ChildNotFoundError";
  }
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ChildOverview {
  orgId: string;
  name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  received: number;
  failureRate: number;
  lastActivityAt: string | null;
  wabaConnected: boolean;
  /** Meta phone quality rating is not stored per organization today. */
  qualityRating: string | null;
}

export type ChildStats = ChildOverview;

interface OrgRow {
  id: string;
  name: string;
  waba_connected: boolean;
}
interface CountRow {
  organization_id: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  received: number;
}
interface ActivityRow {
  organization_id: string;
  last_activity_at: Date | null;
}

async function overviewFor(prisma: PrismaClient, ids: string[], range: DateRange): Promise<ChildOverview[]> {
  if (ids.length === 0) return [];
  const [orgs, counts, activity] = await Promise.all([
    // wabaAccessToken is only tested for NULL here; it is never selected.
    prisma.$queryRaw<OrgRow[]>`
      SELECT id, name,
             (phone_number_id IS NOT NULL AND waba_access_token IS NOT NULL) AS waba_connected
      FROM organizations
      WHERE id = ANY(${ids}::text[])
      ORDER BY name, id`,
    prisma.$queryRaw<CountRow[]>`
      SELECT m.organization_id,
             count(*) FILTER (WHERE m.direction = 'outbound' AND m.status IN ('sent','delivered','read'))::int AS sent,
             count(*) FILTER (WHERE m.direction = 'outbound' AND m.status IN ('delivered','read'))::int AS delivered,
             count(*) FILTER (WHERE m.direction = 'outbound' AND m.status = 'read')::int AS read,
             count(*) FILTER (WHERE m.direction = 'outbound' AND m.status IN ('failed','expired','aborted'))::int AS failed,
             count(*) FILTER (WHERE m.direction = 'inbound')::int AS received
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN contacts ct ON ct.id = c.contact_id AND ct.deleted_at IS NULL
      WHERE m.organization_id = ANY(${ids}::text[])
        AND m.is_system_message = false
        AND m.created_at >= ${range.from} AND m.created_at < ${range.to}
      GROUP BY m.organization_id`,
    prisma.$queryRaw<ActivityRow[]>`
      SELECT m.organization_id, max(m.created_at) AS last_activity_at
      FROM messages m
      WHERE m.organization_id = ANY(${ids}::text[]) AND m.is_system_message = false
      GROUP BY m.organization_id`,
  ]);
  const countBy = new Map(counts.map((r) => [r.organization_id, r]));
  const activityBy = new Map(activity.map((r) => [r.organization_id, r.last_activity_at]));
  return orgs.map((o) => {
    const c = countBy.get(o.id);
    const sent = Number(c?.sent ?? 0);
    const failed = Number(c?.failed ?? 0);
    const last = activityBy.get(o.id) ?? null;
    return {
      orgId: o.id,
      name: o.name,
      sent,
      delivered: Number(c?.delivered ?? 0),
      read: Number(c?.read ?? 0),
      failed,
      received: Number(c?.received ?? 0),
      failureRate: sent + failed > 0 ? Math.round((failed / (sent + failed)) * 1000) / 1000 : 0,
      lastActivityAt: last ? new Date(last).toISOString() : null,
      wabaConnected: Boolean(o.waba_connected),
      qualityRating: null,
    };
  });
}

export async function getChildrenOverview(
  prisma: PrismaClient,
  parentOrgId: string,
  range: DateRange,
): Promise<ChildOverview[]> {
  const ids = await getChildOrgIds(prisma, parentOrgId);
  return overviewFor(prisma, ids, range);
}

export async function getChildStats(
  prisma: PrismaClient,
  parentOrgId: string,
  childOrgId: string,
  range: DateRange,
): Promise<ChildStats> {
  if (!(await isChildOf(prisma, parentOrgId, childOrgId))) throw new ChildNotFoundError();
  const [row] = await overviewFor(prisma, [childOrgId], range);
  if (!row) throw new ChildNotFoundError();
  return row;
}

export interface ChildMessage {
  id: string;
  direction: string;
  contentType: string;
  body: string | null;
  status: string;
  isSystemMessage: boolean;
  sentAt: string;
  createdAt: string;
  contactPhone: string | null;
  contactName: string | null;
}

export async function getChildMessages(
  prisma: PrismaClient,
  parentOrgId: string,
  childOrgId: string,
  opts: { cursor?: string; limit: number },
): Promise<{ items: ChildMessage[]; nextCursor: string | null }> {
  if (!(await isChildOf(prisma, parentOrgId, childOrgId))) throw new ChildNotFoundError();
  const rows = await prisma.message.findMany({
    where: { organizationId: childOrgId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor } } : {}),
    select: {
      id: true,
      direction: true,
      contentType: true,
      body: true,
      status: true,
      isSystemMessage: true,
      sentAt: true,
      createdAt: true,
      conversation: { select: { contact: { select: { phoneNumber: true, name: true } } } },
    },
  });
  const page = rows.slice(0, opts.limit);
  return {
    items: page.map((m) => ({
      id: m.id,
      direction: m.direction,
      contentType: m.contentType,
      body: m.body,
      status: m.status,
      isSystemMessage: m.isSystemMessage,
      sentAt: m.sentAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
      contactPhone: m.conversation?.contact?.phoneNumber ?? null,
      contactName: m.conversation?.contact?.name ?? null,
    })),
    // Prisma cursors are inclusive: the next page starts at the first row we did not return.
    nextCursor: rows[opts.limit]?.id ?? null,
  };
}
