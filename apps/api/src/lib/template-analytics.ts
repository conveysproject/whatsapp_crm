import { Prisma, type PrismaClient } from "@prisma/client";
import { errorMessageForCode, plivoErrorFromMeta } from "./public-api/meta-errors.js";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86_400_000;
const MAX_DAILY_ROWS = 366;
const MAX_FAILURE_ROWS = 10;
const UNKNOWN_FAILURE_MESSAGE = "WhatsApp could not deliver the message.";

/** undefined -> "30d"; a valid value passes through; anything else -> null (the route answers 400 INVALID_RANGE). */
export function parseRange(v: unknown): AnalyticsRange | null {
  if (v === undefined) return "30d";
  return v === "7d" || v === "30d" || v === "90d" || v === "all" ? v : null;
}

export interface TemplateAnalyticsTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityScore: string | null;
  lastEditedTime: Date | null;
  bodyText: string | null;
}

export interface TemplateAnalytics {
  inProgress: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  rates: { delivery: number | null; read: number | null; failure: number | null };
  reach: { uniqueRecipients: number; lastSentAt: string | null };
  daily: Array<{ day: string; sent: number; delivered: number; read: number; failed: number }>;
  failures: Array<{ code: string; title: string | null; message: string; count: number; share: number; lastSeenAt: string | null }>;
  sources: Array<{ source: string; count: number }>;
  template: {
    name: string;
    language: string;
    category: string;
    status: string;
    qualityScore: string | null;
    lastEditedAt: string | null;
    previewText: string | null;
  };
  range: AnalyticsRange;
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const pct = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export async function getTemplateAnalytics(
  prisma: PrismaClient,
  args: { organizationId: string; template: TemplateAnalyticsTemplate; range: AnalyticsRange; now?: Date },
): Promise<TemplateAnalytics> {
  const { organizationId, template, range } = args;
  const now = args.now ?? new Date();
  const today = startOfUtcDay(now);
  const from = range === "all" ? null : startOfUtcDay(new Date(now.getTime() - RANGE_DAYS[range] * DAY_MS));

  // Every query is scoped to this organization AND this template (looked up in the same org by the caller).
  const where = Prisma.sql`organization_id = ${organizationId} AND template_id = ${template.id} AND direction = 'outbound' AND content_type = 'template'${
    from ? Prisma.sql` AND sent_at >= ${from}` : Prisma.empty
  }`;

  const [statusRows, dailyRows, failureRows, sourceRows, reachRows] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string; n: number }>>(
      Prisma.sql`SELECT status::text AS status, count(*)::int AS n FROM messages WHERE ${where} GROUP BY status`,
    ),
    prisma.$queryRaw<Array<{ day: string; sent: number; delivered: number; read: number; failed: number }>>(
      Prisma.sql`SELECT to_char(date_trunc('day', sent_at), 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS sent,
        count(*) FILTER (WHERE status IN ('delivered','read'))::int AS delivered,
        count(*) FILTER (WHERE status = 'read')::int AS read,
        count(*) FILTER (WHERE status IN ('failed','expired','aborted'))::int AS failed
        FROM messages WHERE ${where} GROUP BY 1 ORDER BY 1`,
    ),
    prisma.$queryRaw<Array<{ code: string | null; title: string | null; n: number; last_seen: Date | null }>>(
      Prisma.sql`SELECT delivery_error->>'code' AS code, max(delivery_error->>'title') AS title, count(*)::int AS n, max(sent_at) AS last_seen
        FROM messages WHERE ${where} AND status IN ('failed','expired','aborted') GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    ),
    prisma.$queryRaw<Array<{ source: string | null; n: number }>>(
      Prisma.sql`SELECT coalesce(source, 'unknown') AS source, count(*)::int AS n FROM messages WHERE ${where} GROUP BY 1 ORDER BY n DESC`,
    ),
    prisma.$queryRaw<Array<{ recipients: number; last_sent: Date | null }>>(
      Prisma.sql`SELECT count(DISTINCT conversation_id)::int AS recipients, max(sent_at) AS last_sent FROM messages WHERE ${where}`,
    ),
  ]);

  // Funnel (PRD section 3). Unknown status values are ignored.
  const c: Record<string, number> = {};
  for (const r of statusRows) c[r.status] = (c[r.status] ?? 0) + Number(r.n);
  const n = (s: string) => c[s] ?? 0;
  const read = n("read");
  const delivered = n("delivered") + read;
  const sent = n("sent") + delivered;
  const failed = n("failed") + n("expired") + n("aborted");

  // Daily series: continuous UTC days from `from` (or the first message day for "all") to today, at most 366 rows.
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  let start: Date;
  if (from) start = from;
  else {
    const first = dailyRows[0]?.day;
    start = first ? new Date(`${first}T00:00:00.000Z`) : today;
  }
  const earliest = new Date(today.getTime() - (MAX_DAILY_ROWS - 1) * DAY_MS);
  if (start < earliest) start = earliest;
  const daily: TemplateAnalytics["daily"] = [];
  for (let t = start.getTime(); t <= today.getTime(); t += DAY_MS) {
    const day = dayKey(new Date(t));
    const r = byDay.get(day);
    daily.push({ day, sent: Number(r?.sent ?? 0), delivered: Number(r?.delivered ?? 0), read: Number(r?.read ?? 0), failed: Number(r?.failed ?? 0) });
  }

  const failures = failureRows.slice(0, MAX_FAILURE_ROWS).map((r) => {
    const numeric = r.code != null && /^\d+$/.test(r.code.trim());
    const code = numeric ? (r.code as string).trim() : "unknown";
    const message = numeric ? errorMessageForCode(plivoErrorFromMeta(Number(code))) ?? UNKNOWN_FAILURE_MESSAGE : UNKNOWN_FAILURE_MESSAGE;
    return {
      code,
      title: r.title ?? null,
      message,
      count: Number(r.n),
      share: failed === 0 ? 0 : (pct(Number(r.n), failed) ?? 0),
      lastSeenAt: r.last_seen ? new Date(r.last_seen).toISOString() : null,
    };
  });

  const sourceCounts = new Map<string, number>();
  for (const r of sourceRows) {
    const key = r.source ? r.source : "unknown";
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + Number(r.n));
  }
  const sources = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  const reach = reachRows[0];
  return {
    inProgress: n("sending"),
    sent,
    delivered,
    read,
    failed,
    rates: { delivery: pct(delivered, sent), read: pct(read, delivered), failure: pct(failed, sent + failed) },
    reach: {
      uniqueRecipients: Number(reach?.recipients ?? 0),
      lastSentAt: reach?.last_sent ? new Date(reach.last_sent).toISOString() : null,
    },
    daily,
    failures,
    sources,
    template: {
      name: template.name,
      language: template.language,
      category: template.category,
      status: template.status,
      qualityScore: template.qualityScore,
      lastEditedAt: template.lastEditedTime ? template.lastEditedTime.toISOString() : null,
      previewText: template.bodyText,
    },
    range,
  };
}
