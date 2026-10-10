/**
 * MANUAL integration check of getTemplateAnalytics against a REAL Postgres. Not part of `vitest run`.
 *
 *   docker run -d --name pg-smoke-tplan -e POSTGRES_PASSWORD=smoke -p 15432:5432 postgres:16
 *   docker exec pg-smoke-tplan psql -U postgres -c "create database smoke_tplan"
 *   cd apps/api
 *   export DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:15432/smoke_tplan
 *   pnpm prisma db push
 *   pnpm tsx scripts/smoke-template-analytics-query.ts
 *   docker rm -f pg-smoke-tplan
 *
 * HARD GUARDS: DATABASE_URL must point at 127.0.0.1/localhost and the database name must start with "smoke". The script
 * TRUNCATES messages/conversations/templates/organizations (CASCADE) at the start. It prints PASS/FAIL per check, the
 * EXPLAIN plan of the status-grouping query, and "ALL CHECKS PASSED" (exit 0) or "N CHECK(S) FAILED" (exit 1).
 */
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getTemplateAnalytics } from "../src/lib/template-analytics.js";

const pgPort = process.env["SMOKE_PG_PORT"] ?? "15432";
const DATABASE_URL = process.env["DATABASE_URL"] ?? `postgresql://postgres:smoke@127.0.0.1:${pgPort}/smoke_tplan`;

const isLocal = (host: string) => host === "127.0.0.1" || host === "localhost";
function guardDb(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.searchParams.has("host") || u.searchParams.has("hostaddr")) return false;
    return isLocal(u.hostname) && decodeURIComponent(u.pathname.replace(/^\//, "")).startsWith("smoke");
  } catch { return false; }
}
if (!guardDb(DATABASE_URL)) {
  console.error("REFUSING TO RUN: DATABASE_URL must point at 127.0.0.1/localhost and a database whose name starts with 'smoke'.");
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail)}`);
  if (!ok) failures++;
};
const DAY = 86_400_000;
const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

async function main() {
  await prisma.$executeRaw`TRUNCATE messages, conversations, templates, organizations CASCADE`;

  const mkOrg = async (name: string) => (await prisma.organization.create({ data: { name, status: "active" } })).id;
  const A = await mkOrg("Smoke Org A");
  const B = await mkOrg("Smoke Org B");
  const mkTpl = (org: string) => prisma.template.create({ data: { organizationId: org, name: "promo", category: "marketing", language: "en", status: "approved", bodyText: "Hi {{1}}" } });
  const tA = await mkTpl(A);
  const tB = await mkTpl(B);
  const mkConv = async (org: string) => (await prisma.conversation.create({ data: { organizationId: org } })).id;

  type Seed = { org: string; templateId: string | null; status: "sending" | "sent" | "delivered" | "read" | "failed" | "expired" | "aborted"; sentAt: Date; source?: string | null; code?: string; direction?: "outbound" | "inbound"; contentType?: string; conv: string };
  const convA1 = await mkConv(A);
  const convA2 = await mkConv(A);
  const convB = await mkConv(B);
  const rows: Seed[] = [];
  const add = (n: number, s: Omit<Seed, "direction" | "contentType"> & Partial<Pick<Seed, "direction" | "contentType">>) => { for (let i = 0; i < n; i++) rows.push(s as Seed); };
  // Org A template, in range (3 days ago): the PRD section 3 example plus sources and failure codes
  const base = { org: A, templateId: tA.id, sentAt: daysAgo(3) };
  add(1, { ...base, status: "sending", conv: convA1, source: "api" });
  add(2, { ...base, status: "sent", conv: convA1, source: "api" });
  add(3, { ...base, status: "delivered", conv: convA2, source: "campaign" });
  add(4, { ...base, status: "read", conv: convA2, source: null });
  add(1, { ...base, status: "failed", conv: convA1, source: "api", code: "131049" });
  add(1, { ...base, status: "expired", conv: convA1, source: "api", code: "131049" });
  add(1, { ...base, status: "aborted", conv: convA1, source: "api" });
  // Org A template, 40 days ago: outside 30d, inside 90d and all
  add(2, { org: A, templateId: tA.id, sentAt: daysAgo(40), status: "read", conv: convA1, source: "dashboard" });
  // Noise that must never count: inbound, non-template content, another template id of org A
  add(5, { ...base, status: "read", conv: convA1, direction: "inbound" });
  add(5, { ...base, status: "read", conv: convA1, contentType: "text" });
  add(5, { ...base, templateId: "some-other-template", status: "read", conv: convA1 });
  // Org B: same-named template, plus rows that carry ORG A's template id but belong to org B (must not leak)
  add(7, { org: B, templateId: tB.id, sentAt: daysAgo(3), status: "read", conv: convB, source: "flow" });
  add(6, { org: B, templateId: tA.id, sentAt: daysAgo(3), status: "failed", conv: convB, source: "flow", code: "999999" });

  for (const r of rows) {
    await prisma.message.create({
      data: {
        conversationId: r.conv, organizationId: r.org, direction: r.direction ?? "outbound", contentType: r.contentType ?? "template",
        status: r.status, templateId: r.templateId, source: r.source ?? null, sentAt: r.sentAt,
        deliveryError: r.code ? { code: r.code, title: "Smoke title" } : undefined,
      },
    });
  }

  const tplInput = (t: { id: string; name: string; language: string; category: string; status: string; qualityScore: string | null; lastEditedTime: Date | null; bodyText: string | null }) => t;
  const resA30 = await getTemplateAnalytics(prisma, { organizationId: A, template: tplInput(tA), range: "30d", now: NOW });
  check("30d funnel: inProgress 1, sent 9, delivered 7, read 4, failed 3", resA30.inProgress === 1 && resA30.sent === 9 && resA30.delivered === 7 && resA30.read === 4 && resA30.failed === 3, resA30);
  check("30d rates 77.8 / 57.1 / 25", resA30.rates.delivery === 77.8 && resA30.rates.read === 57.1 && resA30.rates.failure === 25, resA30.rates);
  check("30d reach: 2 distinct conversations, lastSentAt set", resA30.reach.uniqueRecipients === 2 && resA30.reach.lastSentAt !== null, resA30.reach);
  check("30d sources: api 6, campaign 3, unknown 4 (NULL), sorted by count", JSON.stringify(resA30.sources) === JSON.stringify([{ source: "api", count: 6 }, { source: "unknown", count: 4 }, { source: "campaign", count: 3 }]), resA30.sources);
  check("30d failures: only org A's code 131049 (count 2, share 66.7) with a plain-language message; no 999999 leak", resA30.failures.length === 2 && resA30.failures[0]?.code === "131049" && resA30.failures[0].count === 2 && resA30.failures[0].share === 66.7 && !resA30.failures.some((f) => f.code === "999999") && resA30.failures[0].message.includes("engagement"), resA30.failures);
  check("30d daily: 31 rows, continuous, sums match the funnel", resA30.daily.length === 31 && resA30.daily.reduce((a, d) => a + d.sent, 0) === 9 && resA30.daily.reduce((a, d) => a + d.failed, 0) === 3, resA30.daily.length);

  const resA90 = await getTemplateAnalytics(prisma, { organizationId: A, template: tplInput(tA), range: "90d", now: NOW });
  check("90d range includes the 40-day-old rows (read 6, sent 11)", resA90.read === 6 && resA90.sent === 11, [resA90.read, resA90.sent]);
  const resAll = await getTemplateAnalytics(prisma, { organizationId: A, template: tplInput(tA), range: "all", now: NOW });
  check("all range equals 90d here and the daily series starts at the first message day (41 rows)", resAll.sent === 11 && resAll.daily.length === 41, [resAll.sent, resAll.daily.length]);
  const res7 = await getTemplateAnalytics(prisma, { organizationId: A, template: tplInput(tA), range: "7d", now: NOW });
  check("7d excludes the 40-day-old rows (read 4)", res7.read === 4 && res7.daily.length === 8, [res7.read, res7.daily.length]);

  const resB = await getTemplateAnalytics(prisma, { organizationId: B, template: tplInput(tB), range: "30d", now: NOW });
  check("org B's same-named template sees only its own 7 read, none of org A's rows", resB.read === 7 && resB.sent === 7 && resB.failed === 0 && resB.sources.length === 1 && resB.sources[0]?.source === "flow", resB);
  const crossA = await getTemplateAnalytics(prisma, { organizationId: A, template: tplInput(tB), range: "all", now: NOW });
  check("org A asking with org B's template id gets nothing", crossA.sent === 0 && crossA.failed === 0 && crossA.reach.uniqueRecipients === 0, crossA);
  const crossB = await getTemplateAnalytics(prisma, { organizationId: B, template: tplInput(tA), range: "all", now: NOW });
  check("org B's rows that carry org A's template id count only under org B (6 failed), never under org A", crossB.failed === 6 && crossB.sent === 0 && resA30.failed === 3, [crossB.failed, resA30.failed]);

  // Bulk filler so the planner has realistic selectivity: 40000 rows in org A spread over 200 other template ids, 20000 in org B.
  await prisma.$executeRaw`INSERT INTO messages (id, conversation_id, organization_id, direction, content_type, status, template_id, source, sent_at, created_at)
    SELECT gen_random_uuid()::text, ${convA1}, ${A}, 'outbound', 'template', 'delivered', 'filler-' || (g % 200), 'api', now() - (g % 60) * interval '1 day', now() FROM generate_series(1, 40000) g`;
  await prisma.$executeRaw`INSERT INTO messages (id, conversation_id, organization_id, direction, content_type, status, template_id, source, sent_at, created_at)
    SELECT gen_random_uuid()::text, ${convB}, ${B}, 'outbound', 'template', 'read', 'filler-' || (g % 200), 'api', now() - (g % 60) * interval '1 day', now() FROM generate_series(1, 20000) g`;
  await prisma.$executeRawUnsafe("ANALYZE messages");

  console.log("\n== EXPLAIN (statuses query, 30d, org A, 60000 filler rows + ANALYZE)");
  const from = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()) - 30 * DAY);
  const explain = async (seqscanOff: boolean) => {
    return prisma.$transaction(async (tx) => {
      if (seqscanOff) await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      const plan = await tx.$queryRaw<Array<{ "QUERY PLAN": string }>>(Prisma.sql`EXPLAIN SELECT status::text AS status, count(*)::int AS n FROM messages WHERE organization_id = ${A} AND template_id = ${tA.id} AND direction = 'outbound' AND content_type = 'template' AND sent_at >= ${from} GROUP BY status`);
      return plan.map((p) => p["QUERY PLAN"]).join("\n");
    });
  };
  const planDefault = await explain(false);
  console.log("-- default planner settings\n" + planDefault);
  const planNoSeq = await explain(true);
  console.log("-- with enable_seqscan = off (tiny table: Postgres may prefer a seq scan otherwise)\n" + planNoSeq);
  check("with enable_seqscan = off the plan uses messages_org_template_sent_idx", planNoSeq.includes("messages_org_template_sent_idx"), planNoSeq);
}

main()
  .catch((e) => { console.error("SMOKE CRASH:", e); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
