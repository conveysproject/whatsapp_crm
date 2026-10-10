/**
 * MANUAL end-to-end check of template analytics against a REAL Postgres (+ a throwaway local Redis, which the real
 * templates router needs because it imports the WhatsApp/queue modules). Not part of `vitest run`.
 *
 * Exercises together: recordOutbound (templateId/source), messages shaped like the dashboard/API/flow/campaign writers,
 * legacy unlinked rows, the REAL backfill (runBackfill), and the REAL templatesRouter route GET /templates/:id/analytics
 * (auth faked with an onRequest hook, like the route tests).
 *
 *   docker run -d --name pg-smoke-tple2e -e POSTGRES_PASSWORD=smoke -p 15432:5432 postgres:16
 *   docker run -d --name redis-smoke-tple2e -p 16379:6379 redis:7-alpine
 *   docker exec pg-smoke-tple2e psql -U postgres -c "create database smoke_tple2e"
 *   cd apps/api
 *   export DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:15432/smoke_tple2e
 *   pnpm prisma db push
 *   pnpm tsx scripts/smoke-template-analytics-e2e.ts
 *   docker rm -f pg-smoke-tple2e redis-smoke-tple2e
 *
 * On Windows the range 55423-56022 can be excluded by Hyper-V/WSL, so avoid ports in it.
 * HARD GUARDS: DATABASE_URL (and REDIS_URL) must point at 127.0.0.1/localhost, the database name must start with "smoke",
 * and host/hostaddr URL parameters are refused. The script TRUNCATES messages/conversations/templates/organizations
 * (CASCADE) at the start. Prints PASS/FAIL per check and "ALL CHECKS PASSED" (exit 0) or "N CHECK(S) FAILED" (exit 1).
 * All data is fictional.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const pgPort = process.env["SMOKE_PG_PORT"] ?? "15432";
const redisPort = process.env["SMOKE_REDIS_PORT"] ?? "16379";
const DATABASE_URL = process.env["DATABASE_URL"] ?? `postgresql://postgres:smoke@127.0.0.1:${pgPort}/smoke_tple2e`;
const REDIS_URL = process.env["REDIS_URL"] ?? `redis://127.0.0.1:${redisPort}`;

const isLocal = (host: string) => host === "127.0.0.1" || host === "localhost";
function guardDb(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.searchParams.has("host") || u.searchParams.has("hostaddr")) return false;
    return isLocal(u.hostname) && decodeURIComponent(u.pathname.replace(/^\//, "")).startsWith("smoke");
  } catch { return false; }
}
function guardRedis(raw: string): boolean {
  try { return isLocal(new URL(raw).hostname); } catch { return false; }
}
if (!guardDb(DATABASE_URL) || !guardRedis(REDIS_URL)) {
  console.error("REFUSING TO RUN: DATABASE_URL must point at 127.0.0.1/localhost and a database whose name starts with 'smoke'; REDIS_URL must be local.");
  process.exit(2);
}
process.env["DATABASE_URL"] = DATABASE_URL;
process.env["REDIS_URL"] = REDIS_URL;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
let failures = 0;
let total = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  total++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail)}`);
  if (!ok) failures++;
};
const section = (s: string) => console.log(`\n== ${s}`);
const DAY = 86_400_000;
const NOW = new Date();
// Midday UTC of the day N days ago, so a row never straddles a UTC day boundary while the script runs.
const daysAgo = (d: number) => { const t = new Date(NOW.getTime() - d * DAY); t.setUTCHours(12, 0, 0, 0); return t; };

interface Analytics {
  inProgress: number; sent: number; delivered: number; read: number; failed: number;
  rates: { delivery: number | null; read: number | null; failure: number | null };
  reach: { uniqueRecipients: number; lastSentAt: string | null };
  daily: Array<{ day: string; sent: number }>;
  failures: Array<{ code: string; message: string; count: number; share: number }>;
  sources: Array<{ source: string; count: number }>;
  readPercentage: number; attributionNote: string | null;
}

async function main() {
  const { default: Fastify } = await import("fastify");
  const { templatesRouter } = await import("../src/routes/templates.js");
  const { recordOutbound } = await import("../src/lib/record-outbound.js");
  const { runBackfill } = await import("./backfill-message-template-link.js");
  const queues = await import("../src/lib/queue.js");

  await prisma.$executeRaw`TRUNCATE messages, conversations, templates, organizations CASCADE`;

  const mkOrg = async (name: string) => (await prisma.organization.create({ data: { name, status: "active" } })).id;
  const A = await mkOrg("Smoke Org A");
  const B = await mkOrg("Smoke Org B");
  // Templates are backdated 60 days: the attribution note only counts unlinked rows sent AFTER the template was created
  // (legacy rows 2 days ago qualify; a template created now must NOT show the note).
  const mkTpl = (org: string, name: string, language = "en", createdAt: Date = daysAgo(60)) => prisma.template.create({ data: { organizationId: org, name, category: "marketing", language, status: "approved", bodyText: "Hi {{1}}", createdAt } });
  const tA = await mkTpl(A, "promo");
  const tB = await mkTpl(B, "promo");
  await mkTpl(A, "multi", "en");
  await mkTpl(A, "multi", "hi"); // same name, two languages: ambiguous for the backfill
  const mkConv = async (org: string) => (await prisma.conversation.create({ data: { organizationId: org } })).id;
  const convA1 = await mkConv(A);
  const convA2 = await mkConv(A);
  const convB = await mkConv(B);

  type Status = "sending" | "sent" | "delivered" | "read" | "failed" | "expired" | "aborted";
  const tplBody = (name: string) => JSON.stringify({ templateName: name, language: "en" });
  const mk = (o: { org: string; conv: string; status: Status; sentAt: Date; templateId?: string | null; source?: string | null; code?: string; body?: string | null; richContent?: object }) =>
    prisma.message.create({
      data: {
        conversationId: o.conv, organizationId: o.org, direction: "outbound", contentType: "template", status: o.status, sentAt: o.sentAt,
        templateId: o.templateId ?? null, source: o.source ?? null, body: o.body ?? null, richContent: o.richContent,
        deliveryError: o.code ? { code: o.code, title: "Smoke title" } : undefined,
      },
    });
  const many = async (n: number, o: Parameters<typeof mk>[0]) => { for (let i = 0; i < n; i++) await mk(o); };

  // ---- (1)+(2) seed ----
  section("(1) seed: linked rows in every status, writer paths, legacy unlinked rows");
  const d3 = daysAgo(3);
  const link = { org: A, templateId: tA.id, sentAt: d3 };
  await many(1, { ...link, conv: convA1, status: "sending", source: "api" });
  await many(2, { ...link, conv: convA1, status: "sent", source: "api" });
  await many(3, { ...link, conv: convA2, status: "delivered", source: "campaign" }); // campaign worker shape
  await many(4, { ...link, conv: convA2, status: "read", source: "dashboard", body: tplBody("promo") }); // dashboard path shape
  await many(1, { ...link, conv: convA1, status: "failed", source: "api", code: "131049" });
  await many(1, { ...link, conv: convA1, status: "failed", source: "api", code: "131042" });
  await many(1, { ...link, conv: convA1, status: "expired", source: "api", code: "131049" });
  await many(1, { ...link, conv: convA1, status: "aborted", source: "api" });
  await many(1, { org: A, templateId: tA.id, sentAt: daysAgo(12), conv: convA1, status: "delivered", source: "dashboard" }); // 30d only
  await many(2, { org: A, templateId: tA.id, sentAt: daysAgo(40), conv: convA1, status: "read", source: "dashboard" }); // 90d / all only
  // Real writer: recordOutbound with templateId/source (status "sent", sentAt = now)
  for (const [source, conv] of [["api", convA2], ["api", convA2], ["flow", convA2]] as const) {
    await recordOutbound(prisma, { conversationId: conv, organizationId: A, contentType: "template", body: tplBody("promo"), templateId: tA.id, source });
  }
  // Noise that must never count for org A's template
  await many(5, { org: A, templateId: null, sentAt: d3, conv: convA1, status: "read" }); // unlinked and body-less: never linkable, never counted
  await prisma.message.create({ data: { conversationId: convA1, organizationId: A, direction: "inbound", contentType: "template", status: "read", templateId: tA.id, sentAt: d3 } });
  await prisma.message.create({ data: { conversationId: convA1, organizationId: A, direction: "outbound", contentType: "text", status: "read", templateId: tA.id, sentAt: d3 } });
  // Legacy unlinked rows (template_id NULL) for org A, 2 days ago
  const d2 = daysAgo(2);
  const legacyJson1 = await mk({ org: A, conv: convA1, status: "delivered", sentAt: d2, body: tplBody("promo") }); // dashboard/test: source stays NULL
  const legacyJson2 = await mk({ org: A, conv: convA1, status: "read", sentAt: d2, body: tplBody("promo") });
  const legacyApi = await mk({ org: A, conv: convA2, status: "delivered", sentAt: d2, body: tplBody("promo") });
  await prisma.apiMessageMeta.create({ data: { messageId: legacyApi.id, apiKeyId: randomUUID(), organizationId: A, dst: "+10000000000" } });
  const legacyFlow = await mk({ org: A, conv: convA2, status: "sent", sentAt: d2, body: "promo" }); // plain name, flow
  const legacyCampaign = await mk({ org: A, conv: convA2, status: "sent", sentAt: d2, body: "Hi Ann, your offer is ready", richContent: { footer: "Reply STOP to opt out" } });
  const legacyAmbiguous = await mk({ org: A, conv: convA1, status: "sent", sentAt: d2, body: tplBody("multi") });
  const legacyUnmatched = await mk({ org: A, conv: convA1, status: "sent", sentAt: d2, body: tplBody("deleted_tpl") });
  // Org B: same-named template, its own rows, legacy rows, and rows that CARRY ORG A's template id
  await many(7, { org: B, templateId: tB.id, sentAt: d3, conv: convB, status: "read", source: "flow" });
  await many(6, { org: B, templateId: tA.id, sentAt: d3, conv: convB, status: "failed", source: "flow", code: "999999" });
  const legacyB1 = await mk({ org: B, conv: convB, status: "delivered", sentAt: d2, body: tplBody("promo") });
  const legacyB2 = await mk({ org: B, conv: convB, status: "delivered", sentAt: d2, body: tplBody("promo") });
  const legacyKnownIds = [legacyJson1.id, legacyJson2.id, legacyApi.id, legacyFlow.id];
  const legacyLeftIds = [legacyCampaign.id, legacyAmbiguous.id, legacyUnmatched.id];
  const nullCount = (org?: string) => prisma.message.count({ where: { templateId: null, direction: "outbound", contentType: "template", ...(org ? { organizationId: org } : {}) } });
  const seededNullA = await nullCount(A);
  check("seed created org A unlinked outbound template rows (5 noise + 7 legacy = 12) and 2 for org B", seededNullA === 12 && (await nullCount(B)) === 2, [seededNullA, await nullCount(B)]);

  // ---- real router, fake auth ----
  const mkApp = async (org: string, role: string, permissions: Record<string, string>) => {
    const app = Fastify({ logger: false });
    app.decorate("prisma", prisma);
    app.addHook("onRequest", async (r) => { r.auth = { userId: "smoke-user", organizationId: org, role, permissions, teamId: null, teamRole: null } as never; });
    await app.register(templatesRouter, { prefix: "/v1" });
    await app.ready();
    return app;
  };
  const appA = await mkApp(A, "admin", {});
  const appB = await mkApp(B, "admin", {});
  const appAgentNoAccess = await mkApp(A, "agent", {});
  const appAgentAllowed = await mkApp(A, "agent", { templates_access: "allow" });
  const get = async (app: typeof appA, id: string, range?: string) => {
    const res = await app.inject({ method: "GET", url: `/v1/templates/${id}/analytics${range === undefined ? "" : `?range=${range}`}` });
    return { status: res.statusCode, text: res.body, data: (res.json() as { data?: Analytics }).data as Analytics };
  };

  // ---- (3) before backfill ----
  section("(2) route before backfill: PRD section 3 numbers, org A, template promo");
  const r30 = await get(appA, tA.id, "30d");
  const a30 = r30.data;
  check("30d: 200 and funnel inProgress 1, sent 13, delivered 8, read 4, failed 4", r30.status === 200 && a30.inProgress === 1 && a30.sent === 13 && a30.delivered === 8 && a30.read === 4 && a30.failed === 4, a30);
  check("30d rates: delivery 61.5, read 50, failure 23.5; readPercentage 50", a30.rates.delivery === 61.5 && a30.rates.read === 50 && a30.rates.failure === 23.5 && a30.readPercentage === 50, [a30.rates, a30.readPercentage]);
  check("30d daily series: 31 continuous days, sums match the funnel (sent 13)", a30.daily.length === 31 && a30.daily.reduce((s, d) => s + d.sent, 0) === 13, a30.daily.length);
  check("30d reach: 2 distinct conversations and a lastSentAt", a30.reach.uniqueRecipients === 2 && a30.reach.lastSentAt !== null, a30.reach);
  check("30d sources: api 9, dashboard 5, campaign 3, flow 1", JSON.stringify(a30.sources) === JSON.stringify([{ source: "api", count: 9 }, { source: "dashboard", count: 5 }, { source: "campaign", count: 3 }, { source: "flow", count: 1 }]), a30.sources);
  const f131049 = a30.failures.find((f) => f.code === "131049");
  const f131042 = a30.failures.find((f) => f.code === "131042");
  const fUnknown = a30.failures.find((f) => f.code === "unknown");
  check("30d failure reasons: 131049 x2 (50%, plain language), 131042 x1, no-code row as 'unknown' x1; no org B code 999999",
    a30.failures.length === 3 && f131049?.count === 2 && f131049.share === 50 && /engagement/.test(f131049.message) && f131042?.count === 1 && f131042.message.length > 0 && fUnknown?.count === 1 && !a30.failures.some((f) => f.code === "999999"), a30.failures);
  check("30d failure messages are plain language", a30.failures.every((f) => f.message.length > 10 && !/^\d+$/.test(f.message)), a30.failures.map((f) => f.message));
  const tFresh = await mkTpl(A, "fresh_after_release", "en", new Date()); // created now: every unlinked row predates it
  const rFresh = await get(appA, tFresh.id, "30d");
  check("C1: a template created after all unlinked rows (created now) has attributionNote null, sent 0", rFresh.status === 200 && rFresh.data.attributionNote === null && rFresh.data.sent === 0, [rFresh.status, rFresh.data?.attributionNote]);
  check("attributionNote is present before the backfill (unlinked rows sent after the template's creation exist)", typeof a30.attributionNote === "string" && a30.attributionNote.length > 0, a30.attributionNote);
  const r7 = (await get(appA, tA.id, "7d")).data;
  check("7d: sent 12, delivered 7, read 4, failed 4, rates 58.3 / 57.1 / 25, 8 UTC days", r7.sent === 12 && r7.delivered === 7 && r7.read === 4 && r7.failed === 4 && r7.rates.delivery === 58.3 && r7.rates.read === 57.1 && r7.rates.failure === 25 && r7.daily.length === 8, [r7.sent, r7.delivered, r7.read, r7.failed, r7.rates, r7.daily.length]);
  const r90 = (await get(appA, tA.id, "90d")).data;
  check("90d includes the 40-day-old rows: sent 15, delivered 10, read 6; 91 daily rows", r90.sent === 15 && r90.delivered === 10 && r90.read === 6 && r90.daily.length === 91, [r90.sent, r90.delivered, r90.read, r90.daily.length]);
  const rAll = (await get(appA, tA.id, "all")).data;
  check("all equals 90d here; daily series starts at the first message day (41 rows)", rAll.sent === 15 && rAll.read === 6 && rAll.daily.length === 41, [rAll.sent, rAll.read, rAll.daily.length]);
  const rDefault = await get(appA, tA.id);
  check("no range parameter defaults to 30d", rDefault.status === 200 && rDefault.data.sent === 13 && rDefault.data.daily.length === 31, rDefault.data.sent);

  section("(3) errors and access control");
  const bad = await get(appA, tA.id, "365d");
  check("bad range -> 400 INVALID_RANGE", bad.status === 400 && /INVALID_RANGE/.test(bad.text), [bad.status, bad.text]);
  const crossOrg = await get(appA, tB.id, "30d");
  const unknown = await get(appA, "no-such-template-id", "30d");
  check("org B's template id requested as org A -> 404", crossOrg.status === 404, crossOrg.status);
  check("unknown id -> 404 with a body identical to the cross-org 404 (no existence oracle)", unknown.status === 404 && unknown.text === crossOrg.text, [unknown.text, crossOrg.text]);
  const forbidden = await get(appAgentNoAccess, tA.id, "30d");
  check("role without templates_access -> 403 (section gate), no data", forbidden.status === 403 && /FORBIDDEN/.test(forbidden.text) && !/inProgress/.test(forbidden.text), [forbidden.status, forbidden.text]);
  const allowed = await get(appAgentAllowed, tA.id, "30d");
  check("agent WITH templates_access allow -> 200 and the same numbers", allowed.status === 200 && allowed.data.sent === 13, allowed.status);

  section("(4) org isolation");
  const b30 = (await get(appB, tB.id, "30d")).data;
  check("org B's same-named template: only its own 7 read (sources flow 7), none of org A's rows", b30.sent === 7 && b30.read === 7 && b30.failed === 0 && b30.sources.length === 1 && b30.sources[0]?.source === "flow", b30);
  const bCrossA = await get(appB, tA.id, "30d");
  check("org B asking for org A's template id -> 404", bCrossA.status === 404, bCrossA.status);
  check("org B's 6 rows carrying org A's template id never appear in org A's numbers (A failed stays 4, no code 999999)", a30.failed === 4 && !a30.failures.some((f) => f.code === "999999"));

  // ---- backfill ----
  section("(5) backfill: dry run, apply for org A only, idempotent re-run");
  const logs: string[] = [];
  const out = (l: string) => logs.push(l);
  const nullBefore = { a: await nullCount(A), b: await nullCount(B) };
  const dry = await runBackfill(prisma as never, { apply: false }, out);
  check("dry run (all orgs): plans A=4 B=2 updates, 1 ambiguous, 6 unmatched (deleted_tpl + 5 body-less rows), 1 campaign candidate", dry.apply === false && dry.total.unmatched === 6 && dry.orgs.get(A)?.update === 4 && dry.orgs.get(B)?.update === 2 && dry.total.update === 6 && dry.total.ambiguous === 1 && dry.total.unattributedCampaign === 1, { A: dry.orgs.get(A), B: dry.orgs.get(B), total: dry.total });
  check("dry run changed nothing (unlinked counts and updatedRows unchanged)", dry.updatedRows === 0 && (await nullCount(A)) === nullBefore.a && (await nullCount(B)) === nullBefore.b, [dry.updatedRows]);
  const applied = await runBackfill(prisma as never, { org: A, apply: true }, out);
  check("apply --org A updated exactly 4 rows", applied.updatedRows === 4, applied.updatedRows);
  const linked = await prisma.message.findMany({ where: { id: { in: legacyKnownIds } }, select: { id: true, templateId: true, source: true } });
  const by = new Map(linked.map((m) => [m.id, m]));
  check("the 4 expected legacy rows are linked to org A's promo; sources: api row 'api', flow row 'flow', JSON dashboard rows stay NULL",
    linked.every((m) => m.templateId === tA.id) && by.get(legacyApi.id)?.source === "api" && by.get(legacyFlow.id)?.source === "flow" && by.get(legacyJson1.id)?.source === null && by.get(legacyJson2.id)?.source === null, linked);
  const left = await prisma.message.findMany({ where: { id: { in: legacyLeftIds } }, select: { templateId: true } });
  check("campaign-like, ambiguous and unmatched legacy rows stay unlinked", left.length === 3 && left.every((m) => m.templateId === null), left);
  const bRows = await prisma.message.findMany({ where: { id: { in: [legacyB1.id, legacyB2.id] } }, select: { templateId: true, source: true } });
  check("org B untouched by the org A apply", bRows.every((m) => m.templateId === null && m.source === null), bRows);
  const again = await runBackfill(prisma as never, { org: A, apply: true }, out);
  check("second apply for org A updates 0 rows and plans 0 updates", again.updatedRows === 0 && again.total.update === 0 && again.orgs.get(A)?.update === 0, [again.updatedRows, again.total]);
  check("backfill output never printed a connection string", !logs.some((l) => /postgres(ql)?:\/\//.test(l)));

  // ---- after backfill ----
  section("(6) route after the org A backfill");
  const post = (await get(appA, tA.id, "30d")).data;
  check("30d now: sent 17, delivered 11, read 5, failed 4, inProgress 1 (4 legacy rows added)", post.sent === 17 && post.delivered === 11 && post.read === 5 && post.failed === 4 && post.inProgress === 1, post);
  check("30d sources after: api 10, dashboard 5, unknown 2 (backfilled JSON rows keep NULL source), campaign 3, flow 2",
    JSON.stringify(post.sources) === JSON.stringify([{ source: "api", count: 10 }, { source: "dashboard", count: 5 }, { source: "campaign", count: 3 }, { source: "flow", count: 2 }, { source: "unknown", count: 2 }]), post.sources);
  check("attributionNote still present for org A after apply (campaign-like/ambiguous/unmatched/body-less rows remain unlinked: actual behavior, the note predicate is 'any unlinked outbound template row')", typeof post.attributionNote === "string", post.attributionNote);
  const bPre = (await get(appB, tB.id, "30d")).data;
  check("org B's numbers unchanged by org A's apply (sent 7) and its note is still present (its legacy rows are unlinked)", bPre.sent === 7 && typeof bPre.attributionNote === "string", [bPre.sent, bPre.attributionNote]);
  const appliedB = await runBackfill(prisma as never, { apply: true }, out);
  check("apply for all orgs now updates org B's 2 rows only (A already done)", appliedB.updatedRows === 2 && (await nullCount(B)) === 0, appliedB.updatedRows);
  const bPost = (await get(appB, tB.id, "30d")).data;
  check("org B after its backfill: sent 9, delivered 9 (incl. 7 read) and attributionNote is null (nothing unlinked left)", bPost.sent === 9 && bPost.read === 7 && bPost.delivered === 9 && bPost.attributionNote === null, [bPost.sent, bPost.delivered, bPost.read, bPost.attributionNote]);
  const postA2 = (await get(appA, tA.id, "30d")).data;
  check("org A's numbers unaffected by org B's backfill, still no org B rows (failed 4, sent 17)", postA2.sent === 17 && postA2.failed === 4 && !postA2.failures.some((f) => f.code === "999999"), [postA2.sent, postA2.failed]);

  await Promise.all([appA.close(), appB.close(), appAgentNoAccess.close(), appAgentAllowed.close()]);
  await queues.redisConnection.quit().catch(() => undefined);
}

main()
  .catch((e) => { console.error("SMOKE CRASH:", e instanceof Error ? e.stack : e); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n${total} checks run`);
    console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
