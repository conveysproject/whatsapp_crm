/**
 * MANUAL integration check of public-API usage tracking against a REAL Postgres. Not part of `vitest run`.
 *
 * Needs a SCRATCH database whose schema was pushed with `prisma db push`, for example:
 *
 *   docker run -d --name wbmsg-smoke-pg -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke_full -p 55432:5432 postgres:16
 *   cd apps/api
 *   DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:55432/smoke_full npx prisma db push --skip-generate
 *   DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:55432/smoke_full npx tsx scripts/smoke-usage-tracking.ts
 *
 * HARD GUARD: refuses to run unless the DATABASE_URL host is 127.0.0.1/localhost AND the database name starts with
 * "smoke". It TRUNCATES api_request_logs and api_usage_daily at the start. It prints PASS/FAIL per check and
 * "ALL CHECKS PASSED" (exit 0) or "N CHECK(S) FAILED" (exit 1).
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  recordApiRequest, flushApiUsage, resetApiUsageForTests, aggregateEvents, sortGroups, upsertStatement, type ApiRequestEvent, type UsageGroup,
} from "../src/lib/public-api/usage.js";
import { getUsageSummary, listRequests } from "../src/lib/public-api/usage-queries.js";
import { cleanupApiRequestLogs, DELETE_BATCH } from "../src/lib/public-api/usage-cleanup.js";

// ---- hard guard ----
const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
(() => {
  let ok = false;
  try {
    const u = new URL(DATABASE_URL);
    const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
    ok = (u.hostname === "127.0.0.1" || u.hostname === "localhost") && dbName.startsWith("smoke");
  } catch { /* not a URL */ }
  if (!ok) {
    console.error("REFUSING TO RUN: DATABASE_URL must point at 127.0.0.1/localhost and a database whose name starts with 'smoke'.");
    process.exit(2);
  }
})();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  if (!ok) failures++;
};
const info = (msg: string) => console.log(`      ${msg}`);
const section = (s: string) => console.log(`\n== ${s}`);
type Ev = Parameters<typeof recordApiRequest>[0];
const ev = (over: Partial<Ev> & { statusCode: number }) =>
  recordApiRequest({ method: "POST", routeUrl: "/v1/Account/:authId/Message/", durationMs: 20, requestId: "r", messages: 0, ...over });
const rnd = () => randomUUID().slice(0, 8);
const D = (iso: string) => new Date(iso);

async function main() {
  await prisma.$executeRaw`TRUNCATE api_request_logs, api_usage_daily`;
  resetApiUsageForTests();
  const A = (await prisma.organization.create({ data: { name: "Org A" } })).id;
  const B = (await prisma.organization.create({ data: { name: "Org B" } })).id;
  const mkKey = async (org: string, name: string) => (await prisma.apiKey.create({ data: { organizationId: org, name, keyHash: randomUUID(), scopes: [] } })).id;
  const kA1 = await mkKey(A, "A key 1");
  const kA2 = await mkKey(A, "A key 2");
  const kB = await mkKey(B, "B key");

  const mkMsg = async (org: string, conv: string, key: string, status: "sent" | "failed", last: string, err?: object, queuedAt?: Date) => {
    const m = await prisma.message.create({
      data: { conversationId: conv, organizationId: org, direction: "outbound", status, ...(err ? { deliveryError: err } : {}) },
    });
    await prisma.apiMessageMeta.create({ data: { messageId: m.id, apiKeyId: key, organizationId: org, dst: "919000000000", lastStatus: last, ...(queuedAt ? { queuedAt } : {}) } });
  };

  section("Baseline: attribution, rollups, summary, failure reasons, messagesByStatus (7)");
  const conv = await prisma.conversation.create({ data: { organizationId: A } });
  await mkMsg(A, conv.id, kA1, "sent", "delivered"); await mkMsg(A, conv.id, kA1, "sent", "read"); await mkMsg(A, conv.id, kA1, "sent", "sent");
  await mkMsg(A, conv.id, kA1, "failed", "undelivered", { code: 131049, title: "Ecosystem engagement", message: "not delivered" });
  await mkMsg(A, conv.id, kA1, "failed", "undelivered", { code: 131049, title: "Ecosystem engagement", message: "not delivered" });
  await mkMsg(A, conv.id, kA1, "failed", "failed", { code: 131026, title: "Undeliverable" });
  await mkMsg(A, conv.id, kA1, "sent", "delivered", undefined, D("2020-01-01T00:00:00Z")); // outside every range
  const convB = await prisma.conversation.create({ data: { organizationId: B } });
  await mkMsg(B, convB.id, kB, "failed", "failed", { code: 999999, title: "B ONLY" });

  for (let i = 0; i < 5; i++) ev({ statusCode: 202, organizationId: A, apiKeyId: kA1, messages: 2 });
  for (let i = 0; i < 2; i++) ev({ statusCode: 400, organizationId: A, apiKeyId: kA1 });
  ev({ statusCode: 500, organizationId: A, apiKeyId: kA1 });
  for (let i = 0; i < 3; i++) ev({ method: "GET", statusCode: 200, organizationId: A, apiKeyId: kA2 });
  ev({ statusCode: 401, organizationId: A, apiKeyId: kA1 });
  ev({ statusCode: 429 }); ev({ statusCode: 429 });
  for (let i = 0; i < 3; i++) ev({ statusCode: 401 });
  for (let i = 0; i < 4; i++) ev({ statusCode: 202, organizationId: B, apiKeyId: kB, messages: 1 });
  await flushApiUsage(prisma);

  const raw = await prisma.apiRequestLog.count();
  check("raw rows written for every event (12 + 5 unattributed + 4 = 21)", raw === 21, raw);
  const rollA = await prisma.$queryRaw<Array<{ requests: number; success: number; client_errors: number; server_errors: number; auth_failures: number; messages: number }>>`
    SELECT sum(requests)::int AS requests, sum(success)::int AS success, sum(client_errors)::int AS client_errors,
           sum(server_errors)::int AS server_errors, sum(auth_failures)::int AS auth_failures, sum(messages)::int AS messages
      FROM api_usage_daily WHERE organization_id = ${A}`;
  const r = rollA[0]!;
  check("rollup org A: requests 12, success 8, client_errors 3, server_errors 1", r.requests === 12 && r.success === 8 && r.client_errors === 3 && r.server_errors === 1, r);
  check("rollup org A: auth_failures 1, messages accepted 10", r.auth_failures === 1 && r.messages === 10, r);
  check("success + client + server = requests", r.success + r.client_errors + r.server_errors === r.requests);
  const stray = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM api_usage_daily WHERE organization_id NOT IN (${A}, ${B})`;
  check("unattributed requests are in NO rollup", stray[0]!.n === 0, stray);
  const days = await prisma.$queryRaw<Array<{ same: boolean }>>`SELECT bool_and(day = (now() AT TIME ZONE 'UTC')::date) AS same FROM api_usage_daily`;
  check("rollup day is the UTC date", days[0]!.same === true, days);

  const now = Date.now();
  const sum24 = await getUsageSummary(prisma, A, { from: new Date(now - 24 * 3600_000), to: new Date(now + 3600_000) });
  check("summary 24h (hourly, from raw): totals match", !!sum24 && sum24.totals.requests === 12 && sum24.totals.success === 8 && sum24.totals.messages === 10, sum24?.totals);
  const sum7 = await getUsageSummary(prisma, A, { from: new Date(now - 7 * 86400_000), to: new Date(now + 3600_000) });
  check("summary 7d (daily, from rollups): totals match", !!sum7 && sum7.totals.requests === 12 && sum7.totals.success === 8 && sum7.totals.messages === 10, sum7?.totals);
  check("granularity: 7d = day, 24h = hour", sum7?.range.granularity === "day" && sum24?.range.granularity === "hour", [sum7?.range, sum24?.range]);
  check("billableRequests = 12 - 1 auth - 0 limited = 11; failedSignins = 1; errorRate = (3+1-1)/(12-1)", sum7?.totals.billableRequests === 11 && sum7?.totals.failedSignins === 1 && sum7?.totals.errorRate === 0.2727, sum7?.totals);
  console.log("   totals:", JSON.stringify(sum7?.totals));
  console.log("   range:", JSON.stringify(sum7?.range));
  console.log("   byEndpoint:", JSON.stringify(sum7?.byEndpoint));
  console.log("   byCredential:", JSON.stringify(sum7?.byCredential));
  console.log("   messagesByStatus:", JSON.stringify(sum7?.messagesByStatus));
  console.log("   topFailureReasons:", JSON.stringify(sum7?.topFailureReasons));
  const top = sum7?.topFailureReasons ?? [];
  check("topFailureReasons: JSON number code comes back as the STRING '131049' x2 first, never B's code", top[0]?.code === "131049" && String(top[0]?.code) === "131049" && top[0]?.count === 2 && !JSON.stringify(top).includes("999999"), top);
  check("foreign apiKeyId (org B's key asked by org A) -> null", (await getUsageSummary(prisma, A, { from: new Date(now - 86400_000), to: new Date(now + 3600_000), apiKeyId: kB })) === null);
  const sumKey = await getUsageSummary(prisma, A, { from: new Date(now - 7 * 86400_000), to: new Date(now + 3600_000), apiKeyId: kA2 });
  check("per-credential filter (A key 2): 3 requests", sumKey?.totals.requests === 3, sumKey?.totals);
  const sumB = await getUsageSummary(prisma, B, { from: new Date(now - 7 * 86400_000), to: new Date(now + 3600_000) });
  check("org B sees only its own 4 requests", sumB?.totals.requests === 4, sumB?.totals);

  // (7) messagesByStatus: groupBy lastStatus restricted to the queued_at range, org-scoped
  check("(7) messagesByStatus: queued 0, sent 1, delivered 1, read 1, failed 1, undelivered 2 (2020 row and org B excluded)",
    JSON.stringify(sum7?.messagesByStatus) === JSON.stringify({ queued: 0, sent: 1, delivered: 1, read: 1, failed: 1, undelivered: 2 }), sum7?.messagesByStatus);
  const wide = await getUsageSummary(prisma, A, { from: D("2019-12-01T00:00:00Z"), to: D("2020-02-01T00:00:00Z") });
  check("(7) messagesByStatus in a 2020 range counts only the 2020 row", wide?.messagesByStatus.delivered === 1 && Object.values(wide?.messagesByStatus ?? {}).reduce((a, b) => a + b, 0) === 1, wide?.messagesByStatus);

  // listRequests: pagination + filters
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    const res = await listRequests(prisma, A, { limit: 5, ...(cursor ? { cursor } : {}) });
    if (!res || res === "invalid_cursor") { check("listRequests returns pages", false, res); break; }
    for (const row of res.data) seen.add(row.id);
    pages++;
    if (!res.nextCursor || pages > 10) break;
    cursor = res.nextCursor;
  }
  check("listRequests paginates all 12 org-A rows with no duplicates (3 pages of 5)", seen.size === 12 && pages === 3, { seen: seen.size, pages });
  const errs = await listRequests(prisma, A, { limit: 50, outcome: "error" });
  check("outcome=error returns 4 rows (2x400, 401, 500)", !!errs && errs !== "invalid_cursor" && errs.data.length === 4, errs && errs !== "invalid_cursor" ? errs.data.length : errs);
  check("garbage cursor -> invalid_cursor", (await listRequests(prisma, A, { limit: 5, cursor: "not-a-cursor';drop table api_request_logs;--" })) === "invalid_cursor");
  check("foreign apiKeyId in listRequests -> null", (await listRequests(prisma, A, { limit: 5, apiKeyId: kB })) === null);
  check("table survived the injection attempt", (await prisma.apiRequestLog.count()) === 21);

  section("(1) Rollup upsert: repeated flushes add, GREATEST for max, bigint sum");
  const U = `smoke-upsert-${rnd()}`;
  const q1 = async () => (await prisma.$queryRaw<Array<{ requests: number; duration_ms_sum: string; duration_ms_max: number; t: string; messages: number }>>`
    SELECT requests, duration_ms_sum::text AS duration_ms_sum, duration_ms_max, pg_typeof(duration_ms_sum)::text AS t, messages FROM api_usage_daily WHERE organization_id = ${U}`)[0]!;
  ev({ statusCode: 202, organizationId: U, apiKeyId: "ku1", durationMs: 10, messages: 1 });
  ev({ statusCode: 202, organizationId: U, apiKeyId: "ku1", durationMs: 50, messages: 1 });
  await flushApiUsage(prisma);
  let u = await q1();
  check("(1) first flush: requests 2, sum 60, max 50, messages 2", u.requests === 2 && u.duration_ms_sum === "60" && u.duration_ms_max === 50 && u.messages === 2, u);
  ev({ statusCode: 202, organizationId: U, apiKeyId: "ku1", durationMs: 5, messages: 1 });
  await flushApiUsage(prisma);
  u = await q1();
  check("(1) second flush ADDS counters (3 / sum 65 / messages 3) and max stays GREATEST = 50", u.requests === 3 && u.duration_ms_sum === "65" && u.duration_ms_max === 50 && u.messages === 3, u);
  ev({ statusCode: 202, organizationId: U, apiKeyId: "ku1", durationMs: 90 });
  await flushApiUsage(prisma);
  u = await q1();
  check("(1) a larger duration raises max to 90", u.duration_ms_max === 90, u);
  check("(1) duration_ms_sum column stays bigint", u.t === "bigint", u.t);
  const UB = `smoke-bigsum-${rnd()}`;
  for (let i = 0; i < 3; i++) ev({ statusCode: 202, organizationId: UB, apiKeyId: "kub", durationMs: 2_000_000_000 });
  await flushApiUsage(prisma);
  const big = (await prisma.$queryRaw<Array<{ s: string; r: number }>>`SELECT duration_ms_sum::text AS s, duration_ms_max AS r FROM api_usage_daily WHERE organization_id = ${UB}`)[0]!;
  check("(1) duration_ms_sum above 2^31 works (6 000 000 000) and max stays an int", big.s === "6000000000" && big.r === 2_000_000_000, big);
  const bigSummary = await getUsageSummary(prisma, UB, { from: D("2026-01-01T00:00:00Z"), to: new Date(now + 2 * 86400_000) });
  check("(1) the summary converts the bigint sum with Number(): avgLatencyMs = 2 000 000 000", bigSummary?.totals.avgLatencyMs === 2_000_000_000 && bigSummary.totals.requests === 3, bigSummary?.totals);

  section("(2) Opposite-order concurrent transactions: old per-group order deadlocks (40P01), new code does not");
  const day = new Date(now).toISOString().slice(0, 10);
  const grp = (org: string, key: string): UsageGroup => ({
    organizationId: org, apiKeyId: key, day, endpoint: "message.send", requests: 1, success: 1, clientErrors: 0, serverErrors: 0, rateLimited: 0,
    authFailures: 0, messages: 0, durationMsSum: 5, durationMsMax: 5,
  });
  const DL = `smoke-dl-${rnd()}`;
  const gA = grp(DL, "key-a"); const gB = grp(DL, "key-b");
  await prisma.$transaction(async (tx) => { await tx.$executeRaw(upsertStatement([gA, gB])); }); // rows must exist so ON CONFLICT locks them
  // OLD behaviour (emulated): one statement per group, in arrival order, a pause between them (as a slow transaction would have)
  const oldOrder = async (groups: UsageGroup[]) => {
    try {
      await prisma.$transaction(async (tx) => {
        for (const g of groups) {
          await tx.$executeRaw(upsertStatement([g]));
          await tx.$executeRaw`SELECT pg_sleep(0.4)`;
        }
      }, { timeout: 30_000 });
      return "ok";
    } catch (e) {
      return `${(e as { code?: string; meta?: { code?: string } }).code ?? ""}|${JSON.stringify((e as { meta?: unknown }).meta ?? {})}|${String((e as Error).message).slice(0, 120)}`;
    }
  };
  const oldRes = await Promise.all([oldOrder([gA, gB]), oldOrder([gB, gA])]);
  check("(2) OLD per-group arrival order (A,B) vs (B,A) reproduces the deadlock 40P01 in one transaction", oldRes.some((x) => /40P01|deadlock/i.test(x)), oldRes);
  // NEW behaviour: the real code path = sortGroups + ONE multi-row statement, whatever the arrival order
  const newOrder = async (groups: UsageGroup[]) => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(upsertStatement(sortGroups(groups)));
        await tx.$executeRaw`SELECT pg_sleep(0.05)`;
      }, { timeout: 30_000 });
      return "ok";
    } catch (e) { return String((e as Error).message).slice(0, 160); }
  };
  const many = Array.from({ length: 50 }, (_v, i) => grp(DL, `key-${String(i).padStart(3, "0")}`));
  await prisma.$transaction(async (tx) => { await tx.$executeRaw(upsertStatement(sortGroups(many))); });
  const results: string[] = [];
  for (let round = 0; round < 15; round++) {
    results.push(...await Promise.all([newOrder(many), newOrder([...many].reverse()), newOrder([gB, gA, ...many.slice(10, 20)]), newOrder([...many].sort(() => Math.random() - 0.5))]));
  }
  check("(2) NEW sorted multi-row upsert: 60 concurrent opposite-order transactions, zero errors / deadlocks", results.every((x) => x === "ok"), results.filter((x) => x !== "ok").slice(0, 3));
  const dlSum = (await prisma.$queryRaw<Array<{ r: number }>>`SELECT sum(requests)::int AS r FROM api_usage_daily WHERE organization_id = ${DL}`)[0]!.r;
  // creation 2 (gA,gB) + 1 (many) + the old-order survivors (1 or 2 groups) + 15 rounds x (50 + 50 + 12 + 50)
  check("(2) no lost increments from the concurrent new-code transactions (sum is plausible and > 15 x 162)", dlSum >= 15 * 162, dlSum);

  section("(3) A flush of 10 000 raw rows in ONE batch");
  const BIGORG = `smoke-big-${rnd()}`;
  for (let i = 0; i < 10_000; i++) ev({ statusCode: i % 10 === 0 ? 400 : 202, organizationId: BIGORG, apiKeyId: `kbig-${i % 10}`, durationMs: i % 300, messages: 1, requestId: `big-${i}` });
  const t0 = Date.now();
  await flushApiUsage(prisma);
  const ms = Date.now() - t0;
  const bigRaw = await prisma.apiRequestLog.count({ where: { organizationId: BIGORG } });
  const bigRoll = (await prisma.$queryRaw<Array<{ r: number }>>`SELECT sum(requests)::int AS r FROM api_usage_daily WHERE organization_id = ${BIGORG}`)[0]!.r;
  check(`(3) 10 000 raw rows and 10 000 rolled-up requests written in one flush (${ms} ms, transaction timeout 30 000 ms)`, bigRaw === 10_000 && bigRoll === 10_000 && ms < 15_000, { bigRaw, bigRoll, ms });
  try {
    const rows = Array.from({ length: 10_000 }, () => ({ id: randomUUID(), organizationId: BIGORG, apiKeyId: "kdirect", method: "POST", endpoint: "message.send", statusCode: 202, outcome: "success", durationMs: 1, messages: 0, requestId: "d" }));
    await prisma.apiRequestLog.createMany({ data: rows });
    info("INFO: a single 10 000-row createMany (120 000 bind parameters) also works through this Prisma/adapter-pg version; the app still chunks at 2 000 rows");
    await prisma.apiRequestLog.deleteMany({ where: { apiKeyId: "kdirect" } });
  } catch (e) {
    info(`INFO: a single 10 000-row createMany FAILS here (${String((e as Error).message).slice(0, 100)}), which is why flushApiUsage chunks it at 2 000 rows`);
  }

  section("(4) Summary day path with direct rollup rows (bigint SUM -> Number, day::text, custom range bounds)");
  const DAYS = `smoke-days-${rnd()}`;
  const dayRows: string[] = [];
  for (const d of ["2026-08-31", "2026-09-01", "2026-09-15", "2026-09-30", "2026-10-01"]) dayRows.push(d);
  for (const d of dayRows) {
    await prisma.$executeRaw`INSERT INTO api_usage_daily (organization_id, api_key_id, day, endpoint, requests, success, client_errors, duration_ms_sum, duration_ms_max, messages, updated_at)
      VALUES (${DAYS}, 'kd', ${d}::date, 'message.send', 10, 8, 2, 3000000000, 900, 7, now())`;
  }
  const sept = await getUsageSummary(prisma, DAYS, { from: D("2026-09-01T00:00:00Z"), to: D("2026-10-01T00:00:00Z") });
  check("(4) custom 2026-09-01..2026-10-01 (exclusive end) has EXACTLY 30 buckets, last = 2026-09-30, no 2026-10-01", sept?.series.length === 30 && sept.series[0]?.t === "2026-09-01" && sept.series[29]?.t === "2026-09-30", { n: sept?.series.length, first: sept?.series[0]?.t, last: sept?.series.at(-1)?.t });
  check("(4) that range counts exactly the 3 September rows (30 requests): 08-31 and 10-01 are excluded", sept?.totals.requests === 30 && sept.totals.messages === 21, sept?.totals);
  check("(4) SUM(bigint) converts with Number(): avgLatencyMs = 3 000 000 000 / 10 = 300 000 000; max = 900", sept?.totals.avgLatencyMs === 300_000_000 && sept.totals.maxLatencyMs === 900, sept?.totals);
  check("(4) day::text keys are YYYY-MM-DD and match the bucket keys (every populated day lands in its bucket)",
    ["2026-09-01", "2026-09-15", "2026-09-30"].every((k) => sept?.series.find((s) => s.t === k)?.requests === 10) && sept?.series.filter((s) => s.requests > 0).length === 3, sept?.series.filter((s) => s.requests > 0));
  check("(4) range echoes the effective window", sept?.range.from === "2026-09-01T00:00:00.000Z" && sept.range.to === "2026-10-01T00:00:00.000Z" && sept.range.approximate === false, sept?.range);
  const withOct1 = await getUsageSummary(prisma, DAYS, { from: D("2026-09-01T00:00:00Z"), to: D("2026-10-02T00:00:00Z") });
  check("(4) extending the exclusive end to 2026-10-02 includes 10-01 (31 buckets, 40 requests)", withOct1?.series.length === 31 && withOct1.totals.requests === 40, [withOct1?.series.length, withOct1?.totals.requests]);
  check("(4) byCredential / byEndpoint group keys come back as strings with Number() counts",
    sept?.byEndpoint[0]?.endpoint === "message.send" && sept.byEndpoint[0].requests === 30 && sept.byCredential[0]?.apiKeyId === "kd", [sept?.byEndpoint, sept?.byCredential]);

  section("(5) Hour path under a non-UTC session TimeZone (Asia/Kolkata) and server-local TZ");
  const HR = `smoke-hours-${rnd()}`;
  const hourTimes = ["2026-10-05T10:15:00Z", "2026-10-05T10:45:00Z", "2026-10-05T11:05:00Z", "2026-10-05T23:59:59.999Z", "2026-10-06T00:00:00Z", "2026-10-06T10:29:59.999Z", "2026-10-06T10:30:00Z"];
  await prisma.apiRequestLog.createMany({
    data: hourTimes.map((t, i) => ({ id: randomUUID(), organizationId: HR, apiKeyId: "kh", method: "POST", endpoint: "message.send", statusCode: i === 2 ? 400 : 202, outcome: i === 2 ? "client_error" : "success", durationMs: 10, messages: 0, requestId: `h${i}`, createdAt: D(t) })),
  });
  const prismaIST = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL, options: "-c TimeZone=Asia/Kolkata" }) });
  try {
    const tz = (await prismaIST.$queryRaw<Array<{ TimeZone: string }>>`SHOW TimeZone`)[0]?.TimeZone;
    check("(5) the second client really runs with session TimeZone = Asia/Kolkata", tz === "Asia/Kolkata", tz);
    const win = { from: D("2026-10-05T10:30:00Z"), to: D("2026-10-06T10:30:00Z") };
    const sUtc = await getUsageSummary(prisma, HR, win);
    const sIst = await getUsageSummary(prismaIST, HR, win);
    check("(5) hourly series and totals are IDENTICAL under UTC and Asia/Kolkata sessions", JSON.stringify(sUtc?.series) === JSON.stringify(sIst?.series) && JSON.stringify(sUtc?.totals) === JSON.stringify(sIst?.totals), [sUtc?.totals, sIst?.totals]);
    const b = (k: string) => sIst?.series.find((s) => s.t === k);
    check("(5) rows land in the right UTC hour buckets; the row before `from` (10:15) and the row AT `to` (10:30) are excluded",
      sIst?.totals.requests === 5 && b("2026-10-05T10:00:00Z")?.requests === 1 && b("2026-10-05T11:00:00Z")?.requests === 1 && b("2026-10-05T11:00:00Z")?.errors === 1
      && b("2026-10-05T23:00:00Z")?.requests === 1 && b("2026-10-06T00:00:00Z")?.requests === 1 && b("2026-10-06T10:00:00Z")?.requests === 1, { totals: sIst?.totals, nonzero: sIst?.series.filter((s) => s.requests) });
    check("(5) 25 hourly buckets for [10:30, next day 10:30)", sIst?.series.length === 25, sIst?.series.length);
    // timestamps written THROUGH the IST session must still be stored as UTC text
    const wid = randomUUID();
    await prismaIST.apiRequestLog.create({ data: { id: wid, organizationId: HR, apiKeyId: "kh", method: "GET", endpoint: "message.list", statusCode: 200, outcome: "success", durationMs: 1, messages: 0, requestId: "w", createdAt: D("2026-10-05T12:00:00Z") } });
    const stored = (await prisma.$queryRaw<Array<{ t: string }>>`SELECT to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS t FROM api_request_logs WHERE id = ${wid}`)[0]?.t;
    check("(5) a Date written through the IST session is stored as the UTC wall time 2026-10-05T12:00:00", stored === "2026-10-05T12:00:00", stored);
  } finally { await prismaIST.$disconnect(); }
  info(`process TZ for this run: ${process.env["TZ"] ?? "(default)"} / ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  section("(6) Failure-reason join: org scoping, JSON number code -> text, enum literal, null grouping, LIMIT 5");
  const F = (await prisma.organization.create({ data: { name: "Org F" } })).id;
  const kF = await mkKey(F, "F key");
  const convF = await prisma.conversation.create({ data: { organizationId: F } });
  for (let code = 1; code <= 7; code++) for (let n = 0; n < code; n++) await mkMsg(F, convF.id, kF, "failed", "failed", { code: 130000 + code, title: `Reason ${code}` });
  await mkMsg(F, convF.id, kF, "failed", "failed", { message: "no code and no title" });
  await mkMsg(F, convF.id, kF, "failed", "failed", { message: "no code and no title" });
  await mkMsg(F, convF.id, kF, "failed", "failed", { title: "Only a title" });
  await mkMsg(F, convF.id, kF, "failed", "failed"); // delivery_error IS NULL -> excluded
  await mkMsg(F, convF.id, kF, "sent", "queued", { code: 424242, title: "m.status is sent and last_status queued: excluded" });
  await mkMsg(F, convF.id, kF, "failed", "queued", { code: 131007, title: "m.status failed, last_status queued: included via the OR branch" }); // code 131007 = 7th code => with LIMIT it competes
  const fs = await getUsageSummary(prisma, F, { from: new Date(now - 86400_000 * 3), to: new Date(now + 3600_000) });
  const reasons = fs?.topFailureReasons ?? [];
  console.log("   reasons:", JSON.stringify(reasons));
  check("(6) LIMIT 5: exactly 5 reasons, ordered by count desc (7,6,5,4,then the 3x null/title group or code 3)", reasons.length === 5 && reasons.every((x, i) => i === 0 || reasons[i - 1]!.count >= x.count), reasons);
  check("(6) JSON number code returns TEXT ('130007', count 8 incl. the OR-branch row 131007 is a different code so 7)", reasons[0]?.code === "130007" && reasons[0]?.count === 7 && typeof reasons[0]?.code === "string", reasons[0]);
  check("(6) another org's failures never appear in org F (B ONLY / 131049 absent)", !JSON.stringify(reasons).includes("B ONLY") && !JSON.stringify(reasons).includes("131049"), reasons);
  const fAll = (await prisma.$queryRaw<Array<{ code: string | null; title: string | null; count: bigint }>>`
    SELECT m.delivery_error->>'code' AS code, m.delivery_error->>'title' AS title, COUNT(*) AS count FROM api_message_meta a
    JOIN messages m ON m.id = a.message_id AND m.organization_id = a.organization_id
    WHERE a.organization_id = ${F} AND (a.last_status = 'failed' OR m.status = 'failed') AND m.delivery_error IS NOT NULL GROUP BY 1, 2 ORDER BY COUNT(*) DESC`);
  const nullGroup = fAll.find((x) => x.code === null && x.title === null);
  const titleOnly = fAll.find((x) => x.code === null && x.title === "Only a title");
  check("(6) rows with no code and no title group together as (null, null) with count 2; title-only is its own (null, title) group", Number(nullGroup?.count) === 2 && Number(titleOnly?.count) === 1, fAll.map((x) => ({ ...x, count: Number(x.count) })));
  check("(6) m.status = 'failed' with last_status 'queued' IS included; m.status 'sent' + last_status 'queued' is NOT; NULL delivery_error is NOT",
    fAll.some((x) => x.code === "131007") && !fAll.some((x) => x.code === "424242") && fAll.reduce((a, x) => a + Number(x.count), 0) === 28 + 2 + 1 + 1, fAll.map((x) => [x.code, Number(x.count)]));
  const fKey = await getUsageSummary(prisma, F, { from: new Date(now - 86400_000 * 3), to: new Date(now + 3600_000), apiKeyId: kF });
  check("(6) apiKeyId-filtered failure query works (enum literal and key filter together)", (fKey?.topFailureReasons.length ?? 0) === 5, fKey?.topFailureReasons.length);

  section("(8) Cursor pagination with IDENTICAL created_at, limit=1, outcome filter");
  const P = `smoke-page-${rnd()}`;
  const T = D("2026-10-05T12:00:00.000Z");
  const mkRow = (i: number, outcome: string, status: number, at: Date) => ({
    id: randomUUID(), organizationId: P, apiKeyId: "kp", method: "POST", endpoint: "message.send", statusCode: status, outcome,
    durationMs: 1, messages: 0, requestId: `p${i}`, createdAt: at,
  });
  const pageRows = [
    mkRow(0, "client_error", 400, T), mkRow(1, "client_error", 400, T), mkRow(2, "server_error", 500, T), mkRow(3, "client_error", 401, T),
    mkRow(4, "success", 202, T), mkRow(5, "success", 202, T), mkRow(6, "client_error", 400, D("2026-10-05T12:00:00.001Z")),
    mkRow(7, "server_error", 500, D("2026-10-05T11:59:59.999Z")), mkRow(8, "success", 202, D("2026-10-05T11:00:00.000Z")),
  ];
  await prisma.apiRequestLog.createMany({ data: pageRows });
  const walk = async (limit: number, outcome?: "error" | "success" | "client_error") => {
    const got: string[] = []; let cur: string | undefined; let guard = 0;
    for (;;) {
      const res = await listRequests(prisma, P, { limit, ...(outcome ? { outcome } : {}), ...(cur ? { cursor: cur } : {}) });
      if (!res || res === "invalid_cursor") return { got, bad: true };
      got.push(...res.data.map((x) => x.id));
      if (!res.nextCursor || ++guard > 50) break;
      cur = res.nextCursor;
    }
    return { got, bad: false };
  };
  const expectedError = pageRows.filter((x) => x.outcome !== "success").map((x) => x.id).sort();
  const w1 = await walk(1, "error");
  check("(8) limit=1 + outcome=error visits all 6 error rows exactly once (4 share created_at): no skips, no duplicates", !w1.bad && w1.got.length === 6 && new Set(w1.got).size === 6 && [...w1.got].sort().join() === expectedError.join(), w1.got.length);
  const w2 = await walk(2, "error");
  check("(8) limit=2 walks the same 6 rows, same order as limit=1", !w2.bad && w2.got.join() === w1.got.join(), w2.got.length);
  const w3 = await walk(1);
  check("(8) limit=1 without filter visits all 9 rows once", !w3.bad && w3.got.length === 9 && new Set(w3.got).size === 9, w3.got.length);
  const ordered = (await prisma.apiRequestLog.findMany({ where: { organizationId: P }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } })).map((x) => x.id);
  check("(8) pagination order equals ORDER BY created_at DESC, id DESC", w3.got.join() === ordered.join());

  section("(10) EXPLAIN of the main queries (index usage report; seq scans are reported, not failed)");
  await prisma.$executeRaw`ANALYZE api_request_logs`;
  info("(a selective org is used so the planner is not forced into a seq scan by a table-wide tenant; the 10 000-row org is the BIGORG batch)");
  const explain = async (label: string, q: Prisma.Sql) => {
    const rows = await prisma.$queryRaw<Array<Record<string, string>>>(Prisma.sql`EXPLAIN ${q}`);
    const lines = rows.map((x) => Object.values(x)[0] as string);
    const scans = lines.filter((l) => /Scan|Sort|Aggregate|Limit/.test(l)).map((l) => l.replace(/\s*\(cost=.*$/, "").trim());
    console.log(`   [${label}]`);
    for (const l of scans.slice(0, 5)) console.log(`      ${l}`);
    const usesIndex = lines.some((l) => /Index (Only )?Scan|Bitmap Index Scan/.test(l));
    info(usesIndex ? "-> uses an index" : "-> NO index (sequential scan; expected only on small tables)");
  };
  await explain("raw list: org + outcome + keyset cursor, ORDER BY created_at DESC, id DESC LIMIT 51", Prisma.sql`
    SELECT * FROM api_request_logs WHERE organization_id = ${HR} AND outcome IN ('client_error','server_error')
      AND (created_at < ${new Date(now)} OR (created_at = ${new Date(now)} AND id < 'zzzz')) ORDER BY created_at DESC, id DESC LIMIT 51`);
  await explain("hourly aggregate over the raw log (org + created_at range)", Prisma.sql`
    SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS k, COUNT(*) FROM api_request_logs
      WHERE organization_id = ${HR} AND created_at >= ${new Date(now - 86400_000)} AND created_at < ${new Date(now + 3600_000)} GROUP BY k ORDER BY k`);
  await explain("daily rollup aggregate (org + day range)", Prisma.sql`
    SELECT day::text AS k, COALESCE(SUM(requests),0) FROM api_usage_daily WHERE organization_id = ${DAYS} AND day >= '2026-09-01'::date AND day <= '2026-09-30'::date GROUP BY k ORDER BY k`);
  await explain("retention delete subselect (created_at < cutoff LIMIT 5000)", Prisma.sql`
    SELECT id FROM api_request_logs WHERE created_at < ${new Date(now - 30 * 86400_000)} LIMIT 5000`);
  await explain("failure-reason join (api_message_meta x messages, org + queued_at range)", Prisma.sql`
    SELECT m.delivery_error->>'code' AS code, COUNT(*) FROM api_message_meta a JOIN messages m ON m.id = a.message_id AND m.organization_id = a.organization_id
      WHERE a.organization_id = ${F} AND a.queued_at >= ${new Date(now - 86400_000)} AND a.queued_at < ${new Date(now + 3600_000)}
        AND (a.last_status = 'failed' OR m.status = 'failed') AND m.delivery_error IS NOT NULL GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 5`);

  section("(9) Retention cleanup: only old rows (incl. null-org), rollups untouched, time-budget loop");
  const rollBefore = (await prisma.$queryRaw<Array<{ n: number; s: number }>>`SELECT count(*)::int AS n, sum(requests)::int AS s FROM api_usage_daily`)[0]!;
  const CL = `smoke-clean-${rnd()}`;
  await prisma.apiRequestLog.createMany({
    data: [
      { ...mkRow(1, "success", 200, new Date(now - 40 * 86400_000)), organizationId: CL },
      { ...mkRow(2, "client_error", 400, new Date(now - 31 * 86400_000)), organizationId: CL },
      { ...mkRow(3, "client_error", 401, new Date(now - 90 * 86400_000)), organizationId: null, apiKeyId: null },
      { ...mkRow(4, "client_error", 429, new Date(now - 45 * 86400_000)), organizationId: null, apiKeyId: null },
      { ...mkRow(5, "success", 200, new Date(now - 29 * 86400_000)), organizationId: CL },
      { ...mkRow(6, "success", 200, new Date(now - 1 * 86400_000)), organizationId: CL },
      { ...mkRow(7, "success", 200, new Date(now)), organizationId: CL },
    ],
  });
  const cutoff = new Date(now - 30 * 86400_000);
  const oldBefore = await prisma.apiRequestLog.count({ where: { createdAt: { lt: cutoff } } });
  const newBefore = await prisma.apiRequestLog.count({ where: { createdAt: { gte: cutoff } } });
  const deleted = await cleanupApiRequestLogs(prisma, new Date(now));
  const oldAfter = await prisma.apiRequestLog.count({ where: { createdAt: { lt: cutoff } } });
  const newAfter = await prisma.apiRequestLog.count({ where: { createdAt: { gte: cutoff } } });
  const rollAfter = (await prisma.$queryRaw<Array<{ n: number; s: number }>>`SELECT count(*)::int AS n, sum(requests)::int AS s FROM api_usage_daily`)[0]!;
  check(`(9) deleted exactly the ${oldBefore} old rows (>= 4 incl. the 2 null-org rows), kept all ${newBefore} newer ones`, deleted === oldBefore && oldBefore >= 4 && oldAfter === 0 && newAfter === newBefore, { deleted, oldBefore, oldAfter, newBefore, newAfter });
  check("(9) null-org old rows were removed and recent null-org rows (unattributed 401/429 from the baseline) were kept",
    (await prisma.apiRequestLog.count({ where: { organizationId: null, createdAt: { lt: cutoff } } })) === 0 && (await prisma.apiRequestLog.count({ where: { organizationId: null } })) >= 5);
  check("(9) api_usage_daily is untouched (same row count and request sum)", rollAfter.n === rollBefore.n && rollAfter.s === rollBefore.s, { rollBefore, rollAfter });
  check("(9) the 29-day, 1-day and now rows of org CL survived", (await prisma.apiRequestLog.count({ where: { organizationId: CL } })) === 3);

  await prisma.$executeRaw`
    INSERT INTO api_request_logs (id, organization_id, api_key_id, method, endpoint, status_code, outcome, duration_ms, messages, request_id, created_at)
    SELECT gen_random_uuid()::text, ${CL}, 'kold', 'POST', 'message.send', 200, 'success', 1, 0, 'old-' || g, now() - interval '60 days' FROM generate_series(1, ${DELETE_BATCH * 2 + 2000}) g`;
  const budgetZero = await cleanupApiRequestLogs(prisma, new Date(), 0);
  check(`(9) time budget 0: exactly ONE batch (${DELETE_BATCH}) deleted, the rest waits for the next run`, budgetZero === DELETE_BATCH && (await prisma.apiRequestLog.count({ where: { apiKeyId: "kold" } })) === DELETE_BATCH + 2000, budgetZero);
  const tLoop = Date.now();
  const rest = await cleanupApiRequestLogs(prisma, new Date());
  check(`(9) normal budget: loops full batches then stops on the short one (${DELETE_BATCH} + 2000 = ${DELETE_BATCH + 2000} in ${Date.now() - tLoop} ms)`, rest === DELETE_BATCH + 2000 && (await prisma.apiRequestLog.count({ where: { apiKeyId: "kold" } })) === 0, rest);
  const rollFinal = (await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM api_usage_daily`)[0]!.n;
  check("(9) rollups still untouched after the budget loop", rollFinal === rollBefore.n, rollFinal);
}

main()
  .catch((e) => { console.error("SMOKE CRASH:", e); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
