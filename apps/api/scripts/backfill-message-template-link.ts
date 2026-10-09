/**
 * Backfill messages.template_id / messages.source for OUTBOUND TEMPLATE messages sent before those columns existed.
 * DRY RUN by default: prints per-organization counts and changes nothing (the whole run is one READ ONLY transaction).
 * Writes only with --apply.
 *
 * Usage (DATABASE_PUBLIC_URL is injected by railway; never hard-code or print a connection string):
 *   railway run --service Postgres pnpm tsx scripts/backfill-message-template-link.ts [--org <id>] [--apply]
 *
 * Rules: only direction='outbound', content_type='template', template_id IS NULL. A template name maps to a template ONLY
 * when the organization has exactly one template with that name (several languages = ambiguous, counted, not guessed).
 * source: api_message_meta row -> 'api'; flow plain-name body -> 'flow'; dashboard/test JSON rows stay NULL (not
 * distinguishable). Campaign rows keep only rendered text + header/footer/buttons (no template name in body or
 * rich_content, see campaign.worker.ts), so they cannot be attributed and are only counted. Re-runs are idempotent:
 * every UPDATE re-checks organization_id and template_id IS NULL, and never overwrites a non-NULL template_id/source.
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseArgs, planBackfill, templateKey,
  type BackfillArgs, type BackfillRow, type BackfillUpdate,
} from "./backfill-message-template-link.helpers.js";

export const BATCH_SIZE = 500;

interface RawRow {
  id: string;
  organization_id: string;
  body: string | null;
  rich_content: unknown;
  has_api_meta: boolean;
}

/** The slice of a Prisma client / transaction client this script uses (lets tests pass a mock). */
export interface BackfillDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
export interface BackfillPrisma extends BackfillDb {
  $transaction<T>(fn: (tx: BackfillDb) => Promise<T>, options?: { timeout?: number; maxWait?: number }): Promise<T>;
}

interface OrgCounts { update: number; ambiguous: number; unmatched: number; unattributedCampaign: number; skipped: number }
export interface BackfillSummary { orgs: Map<string, OrgCounts>; total: OrgCounts; updatedRows: number; apply: boolean }

const zero = (): OrgCounts => ({ update: 0, ambiguous: 0, unmatched: 0, unattributedCampaign: 0, skipped: 0 });

async function pass(db: BackfillDb, a: BackfillArgs, out: (l: string) => void): Promise<BackfillSummary> {
  const orgs = new Map<string, OrgCounts>();
  const total = zero();
  let updatedRows = 0;
  const tplCache = new Map<string, string[]>(); // templateKey(org, name) -> ids; filled per organization on first sight
  const seenOrgs = new Set<string>();
  const orgFilter = a.org ?? null;
  let cursor = "";

  for (;;) {
    const raw = await db.$queryRaw<RawRow[]>`
      SELECT m.id, m.organization_id, m.body, m.rich_content, (am.message_id IS NOT NULL) AS has_api_meta
        FROM messages m
        LEFT JOIN api_message_meta am ON am.message_id = m.id AND am.organization_id = m.organization_id
       WHERE m.direction = 'outbound' AND m.content_type = 'template' AND m.template_id IS NULL
         AND m.id > ${cursor}
         AND (${orgFilter}::text IS NULL OR m.organization_id = ${orgFilter})
       ORDER BY m.id
       LIMIT ${BATCH_SIZE}`;
    if (raw.length === 0) break;
    cursor = raw[raw.length - 1]!.id;

    const newOrgs = [...new Set(raw.map((r) => r.organization_id))].filter((o) => !seenOrgs.has(o));
    if (newOrgs.length > 0) {
      const tpls = await db.$queryRaw<Array<{ id: string; organization_id: string; name: string }>>`
        SELECT id, organization_id, name FROM templates WHERE organization_id = ANY(${newOrgs})`;
      for (const t of tpls) {
        const k = templateKey(t.organization_id, t.name);
        tplCache.set(k, [...(tplCache.get(k) ?? []), t.id]);
      }
      for (const o of newOrgs) seenOrgs.add(o);
    }

    const rows: BackfillRow[] = raw.map((r) => ({
      id: r.id, organizationId: r.organization_id, body: r.body, richContent: r.rich_content, hasApiMeta: r.has_api_meta, templateId: null,
    }));
    // Plan per organization so the counts can be attributed.
    const byOrg = new Map<string, BackfillRow[]>();
    for (const r of rows) byOrg.set(r.organizationId, [...(byOrg.get(r.organizationId) ?? []), r]);
    const updates: BackfillUpdate[] = [];
    for (const [org, orgRows] of byOrg) {
      const p = planBackfill(orgRows, tplCache);
      const c = orgs.get(org) ?? zero();
      for (const target of [c, total]) {
        target.update += p.updates.length; target.ambiguous += p.ambiguous; target.unmatched += p.unmatched;
        target.unattributedCampaign += p.unattributedCampaign; target.skipped += p.skippedAlreadyLinked;
      }
      orgs.set(org, c);
      updates.push(...p.updates);
    }

    if (a.apply && updates.length > 0) {
      // ONE parameterized statement per batch. organization_id and template_id IS NULL are re-checked per row, and
      // source is only filled when still NULL, so a concurrent or repeated run can never overwrite anything.
      updatedRows += await db.$executeRaw`
        UPDATE messages m
           SET template_id = v.template_id, source = COALESCE(m.source, v.source)
          FROM unnest(${updates.map((u) => u.id)}::text[], ${updates.map((u) => u.organizationId)}::text[],
                      ${updates.map((u) => u.templateId)}::text[], ${updates.map((u) => u.source)}::text[])
               AS v(id, organization_id, template_id, source)
         WHERE m.id = v.id AND m.organization_id = v.organization_id AND m.template_id IS NULL`;
    }
    if (raw.length < BATCH_SIZE) break;
  }

  out(`mode: ${a.apply ? "APPLY" : "DRY RUN (nothing is written)"}${a.org ? `, organization ${a.org}` : ", all organizations"}`);
  for (const [org, c] of [...orgs].sort(([x], [y]) => x.localeCompare(y))) {
    out(`org ${org}: to_update=${c.update} ambiguous=${c.ambiguous} unmatched=${c.unmatched} unattributed_campaign_candidates=${c.unattributedCampaign}`);
  }
  out(`TOTAL: to_update=${total.update} ambiguous=${total.ambiguous} unmatched=${total.unmatched} unattributed_campaign_candidates=${total.unattributedCampaign}`);
  if (a.apply) out(`updated_rows=${updatedRows}`);
  return { orgs, total, updatedRows, apply: a.apply };
}

export async function runBackfill(prisma: BackfillPrisma, a: BackfillArgs, out: (line: string) => void): Promise<BackfillSummary> {
  if (a.apply) return pass(prisma, a, out);
  // Dry run: one READ ONLY transaction on a single connection, so even a bug cannot write.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return pass(tx, a, out);
  }, { timeout: 30 * 60_000, maxWait: 30_000 });
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2)); // throws before connecting if args are invalid
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await runBackfill(prisma as unknown as BackfillPrisma, a, (l) => console.log(l));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // Never print e.message for DB errors: driver errors can embed the connection string. Our own arg/env errors are safe.
    const safe = e instanceof Error && /^(--|DATABASE_)/.test(e.message) ? e.message : `backfill failed (${e instanceof Error ? e.name : "error"})`;
    console.error(safe);
    process.exit(1);
  });
}
