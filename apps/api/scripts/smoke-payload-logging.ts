/**
 * MANUAL integration check of public-API payload logging against a REAL Postgres (and a throwaway local Redis, which the
 * real public-API router needs for its rate limiters and BullMQ queues). Not part of `vitest run`.
 *
 * Uses the REAL Fastify plugins (publicApiRouter, apiUsageRouter), the real recorder/flush, the real cleanup and the real
 * staff lookup. Only auth for the dashboard router is faked (an onRequest hook sets request.auth), like the route tests.
 *
 *   docker run -d --name pg-smoke-paylog -e POSTGRES_PASSWORD=smoke -p 15432:5432 postgres:16
 *   docker run -d --name redis-smoke-paylog -p 16379:6379 redis:7-alpine
 *   docker exec pg-smoke-paylog psql -U postgres -c "create database smoke_paylog" -c "create database smoke_paylog_mig"
 *   cd apps/api
 *   export SMOKE_PG_PORT=15432 SMOKE_REDIS_PORT=16379
 *   export DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:$SMOKE_PG_PORT/smoke_paylog
 *   pnpm prisma db push                       # (prisma 7 has no --skip-generate)
 *   # optional: prove the hand-written migration SQL equals db push
 *   docker exec -i pg-smoke-paylog psql -U postgres -d smoke_paylog_mig -v ON_ERROR_STOP=1 < prisma/migrations/20261009000000_api_payload_logging/migration.sql
 *   export SMOKE_MIGRATION_DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:$SMOKE_PG_PORT/smoke_paylog_mig
 *   pnpm tsx scripts/smoke-payload-logging.ts
 *
 * SMOKE_PG_PORT (default 55432) is only used when DATABASE_URL is not set. On Windows the range 55423-56022 can be excluded
 * by Hyper-V/WSL; pick another port such as 15432.
 *
 * HARD GUARDS: DATABASE_URL (and SMOKE_MIGRATION_DATABASE_URL, REDIS_URL) must point at 127.0.0.1/localhost, and the
 * database names must start with "smoke". The script TRUNCATES the three payload-logging tables at the start. It prints
 * PASS/FAIL per check and "ALL CHECKS PASSED" (exit 0) or "N CHECK(S) FAILED" (exit 1).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---- environment + hard guard (must run before the app modules are imported: they read env at import time) ----
const pgPort = process.env["SMOKE_PG_PORT"] ?? "55432";
const redisPort = process.env["SMOKE_REDIS_PORT"] ?? "16379";
const DATABASE_URL = process.env["DATABASE_URL"] ?? `postgresql://postgres:smoke@127.0.0.1:${pgPort}/smoke_paylog`;
const MIGRATION_DATABASE_URL = process.env["SMOKE_MIGRATION_DATABASE_URL"] ?? "";
const REDIS_URL = process.env["REDIS_URL"] ?? `redis://127.0.0.1:${redisPort}`;

const isLocal = (host: string) => host === "127.0.0.1" || host === "localhost";
function guardDb(raw: string): boolean {
  try {
    const u = new URL(raw);
    return isLocal(u.hostname) && decodeURIComponent(u.pathname.replace(/^\//, "")).startsWith("smoke");
  } catch { return false; }
}
function guardRedis(raw: string): boolean {
  try { return isLocal(new URL(raw).hostname); } catch { return false; }
}
if (!guardDb(DATABASE_URL) || (MIGRATION_DATABASE_URL !== "" && !guardDb(MIGRATION_DATABASE_URL)) || !guardRedis(REDIS_URL)) {
  console.error("REFUSING TO RUN: DATABASE_URL must point at 127.0.0.1/localhost and a database whose name starts with 'smoke'; REDIS_URL must be local.");
  process.exit(2);
}
process.env["DATABASE_URL"] = DATABASE_URL;
process.env["REDIS_URL"] = REDIS_URL;
process.env["PUBLIC_API_ENABLED"] = "true";
process.env["PUBLIC_API_TOKEN_KEY"] = randomBytes(32).toString("base64");
process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
delete process.env["PUBLIC_API_ALLOWED_ORGS"];
delete process.env["API_PAYLOAD_RETENTION_DAYS"];
delete process.env["API_REQUEST_LOG_SUCCESS_SAMPLE_RATE"];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  if (!ok) failures++;
};
const section = (s: string) => console.log(`\n== ${s}`);
const DAY = 86_400_000;

async function main() {
  // Dynamic imports: the modules below read DATABASE_URL / REDIS_URL / PUBLIC_API_* when first imported.
  const { default: Fastify } = await import("fastify");
  const { publicApiRouter } = await import("../src/routes/public-api/index.js");
  const { apiUsageRouter } = await import("../src/routes/api-usage.js");
  const { newAuthToken, hashToken, encryptToken } = await import("../src/lib/public-api/credentials.js");
  const { recordApiRequest, flushApiUsage, resetApiUsageForTests } = await import("../src/lib/public-api/usage.js");
  const { buildPayloadSnapshot } = await import("../src/lib/public-api/payload-capture.js");
  const { recordCallbackAttempt } = await import("../src/lib/public-api/callback-attempts.js");
  const { cleanupApiPayloads } = await import("../src/lib/public-api/payload-cleanup.js");
  const { runLookup } = await import("./lookup-api-request.js");
  const queues = await import("../src/lib/queue.js");

  await prisma.$executeRaw`TRUNCATE api_request_payloads, api_callback_attempts, api_payload_access_audit, api_request_logs, api_usage_daily`;
  resetApiUsageForTests();

  // ---- fixtures: two orgs, one credential each, org A has a connected WhatsApp number ----
  const mkOrg = async (name: string) => (await prisma.organization.create({ data: { name, status: "active", phoneNumberId: `pn-${randomUUID().slice(0, 8)}`, wabaAccessToken: "smoke-waba-token" } })).id;
  const A = await mkOrg("Smoke Org A");
  const B = await mkOrg("Smoke Org B");
  await prisma.vendorSetting.create({ data: { organizationId: A, key: "current_phone_number_number", value: "+1 415-555-2671" } });
  const mkCred = async (org: string, name: string) => {
    const token = newAuthToken();
    const row = await prisma.apiKey.create({ data: { organizationId: org, name, keyHash: hashToken(token), tokenEnc: encryptToken(token), scopes: [] } });
    return { authId: row.id, token };
  };
  const credA = await mkCred(A, "A key");
  const credB = await mkCred(B, "B key");
  const basic = (c: { authId: string; token: string }) => `Basic ${Buffer.from(`${c.authId}:${c.token}`).toString("base64")}`;

  const app = Fastify({ logger: false });
  app.decorate("prisma", prisma);
  await app.register(publicApiRouter, { prefix: "/v1/Account/:authId" });
  await app.ready();
  const url = `/v1/Account/${credA.authId}/Message/`;
  const send = (payload: unknown, auth: string) => app.inject({ method: "POST", url, headers: { authorization: auth }, payload: payload as never });

  section("(1) 202 / 400 / 401 through the real router + real flush");
  const SECRET_AUTH_TOKEN = `secret-${randomUUID()}`;
  const r202 = await send({ src: "+14155552671", dst: "+14155552672", type: "whatsapp", text: "hello smoke" }, basic(credA));
  const r400 = await send({ src: "+14155552671", type: "whatsapp", text: "no destination", auth_token: SECRET_AUTH_TOKEN }, basic(credA));
  const wrong = { authId: credA.authId, token: `wrong-${randomUUID()}` };
  const r401 = await send({ src: "+14155552671", dst: "+14155552672", type: "whatsapp", text: "x" }, basic(wrong));
  check("statuses are 202, 400, 401", r202.statusCode === 202 && r400.statusCode === 400 && r401.statusCode === 401, [r202.statusCode, r400.statusCode, r401.statusCode]);
  const apiId = (r: { json: () => unknown }) => (r.json() as { api_id?: string }).api_id;
  const [id202, id400, id401] = [apiId(r202), apiId(r400), apiId(r401)];
  check("every response carries an api_id", !!id202 && !!id400 && !!id401, [id202, id400, id401]);
  await flushApiUsage(prisma);
  const pay = (id: string | undefined) => prisma.apiRequestPayload.findUnique({ where: { id: id ?? "none" } });
  const [p202, p400, p401] = [await pay(id202), await pay(id400), await pay(id401)];
  check("payload rows exist for the 202 and the 400 and NOT for the 401", !!p202 && !!p400 && p401 === null, [!!p202, !!p400, !!p401]);
  check("payload id equals the response api_id, organization is org A", p202?.id === id202 && p400?.id === id400 && p202?.organizationId === A, [p202?.id, p400?.id]);
  const meta = await prisma.apiRequestLog.findMany({ where: { id: { in: [id202!, id400!, id401!] } }, select: { id: true, statusCode: true } });
  check("metadata row id equals api_id for all three (the 401 keeps its metadata row)", meta.length === 3 && meta.every((m) => [id202, id400, id401].includes(m.id)), meta);
  check("stored statuses: 202 and 400, response body contains the api_id", p202?.statusCode === 202 && p400?.statusCode === 400 && (p202?.responseBody ?? "").includes(id202!), [p202?.statusCode, p400?.statusCode]);

  section("(2) secrets never stored");
  const dump = async () => (await prisma.$queryRaw<Array<{ t: string }>>`
    SELECT to_jsonb(p)::text AS t FROM api_request_payloads p
    UNION ALL SELECT to_jsonb(l)::text FROM api_request_logs l
    UNION ALL SELECT to_jsonb(c)::text FROM api_callback_attempts c`).map((x) => x.t).join("\n");
  const stored = await dump();
  const needles = [basic(credA), basic(wrong), Buffer.from(`${credA.authId}:${credA.token}`).toString("base64"), credA.token, wrong.token, SECRET_AUTH_TOKEN];
  check("no stored row contains the Basic header value, its base64, the real token, the wrong token or the raw auth_token", needles.every((n) => !stored.includes(n)), needles.filter((n) => stored.includes(n)).length);
  const body400 = JSON.parse(p400?.requestBody ?? "{}") as Record<string, unknown>;
  check("the 400 request body keeps the field name auth_token with the value [redacted]", body400["auth_token"] === "[redacted]", body400);

  section("(3) 17 KB body is truncated at 16384");
  const big = Object.fromEntries(Array.from({ length: 12 }, (_v, i) => [`field${i}`, "x".repeat(1500)])); // ~18 KB of JSON
  const rBig = await send({ src: "+14155552671", type: "whatsapp", text: "big", ...big }, basic(credA));
  await flushApiUsage(prisma);
  const pBig = await pay(apiId(rBig));
  check("17 KB request: stored length is exactly 16384 and requestTruncated is true", !!pBig && pBig.requestBody?.length === 16384 && pBig.requestTruncated === true, [pBig?.requestBody?.length, pBig?.requestTruncated]);
  const rSmall = await pay(id202);
  check("a small request is not flagged truncated", rSmall?.requestTruncated === false && rSmall.responseTruncated === false);

  section("(4) cross-org isolation at the query level");
  check("findFirst with the other organizationId returns null; with the right one returns the row",
    (await prisma.apiRequestPayload.findFirst({ where: { id: id202!, organizationId: B } })) === null && !!(await prisma.apiRequestPayload.findFirst({ where: { id: id202!, organizationId: A } })));

  section("(5) dashboard endpoints through the real router, auth faked");
  const dash = (org: string) => {
    const d = Fastify({ logger: false });
    d.decorate("prisma", prisma);
    d.addHook("onRequest", async (r) => { r.auth = { userId: "smoke-user", organizationId: org, role: "admin", permissions: {}, teamId: null, teamRole: null } as never; });
    return d;
  };
  const dashA = dash(A);
  const dashB = dash(B);
  await dashA.register(apiUsageRouter, { prefix: "/v1" });
  await dashB.register(apiUsageRouter, { prefix: "/v1" });
  // org B gets one request of its own so a leak in either direction would show
  const rB = await app.inject({ method: "POST", url: `/v1/Account/${credB.authId}/Message/`, headers: { authorization: basic(credB) }, payload: { src: "+14155552671", type: "whatsapp", text: "b" } });
  await flushApiUsage(prisma);
  const idB = apiId(rB)!;
  const listA = (await dashA.inject({ method: "GET", url: "/v1/api-usage/payloads?limit=100" })).json() as { enabled: boolean; data: Array<{ id: string }>; nextCursor: string | null };
  const idsA = listA.data.map((x) => x.id);
  check("GET /payloads (org A): flag reported on, only org A's rows (202, 400, big), none of org B's", listA.enabled === true && idsA.includes(id202!) && idsA.includes(id400!) && idsA.length === 3 && !idsA.includes(idB), idsA);
  const listB = (await dashB.inject({ method: "GET", url: "/v1/api-usage/payloads" })).json() as { data: Array<{ id: string }> };
  check("GET /payloads (org B): exactly its own single row", listB.data.length === 1 && listB.data[0]?.id === idB, listB.data.map((x) => x.id));
  const detA = await dashA.inject({ method: "GET", url: `/v1/api-usage/payloads/${id202}` });
  check("GET /payloads/:id (org A, own id) -> 200 with the stored bodies", detA.statusCode === 200 && (detA.json() as { id: string }).id === id202 && typeof (detA.json() as { requestBody: string }).requestBody === "string", detA.statusCode);
  const detX = await dashA.inject({ method: "GET", url: `/v1/api-usage/payloads/${idB}` });
  check("GET /payloads/:id (org A asking for org B's id) -> 404", detX.statusCode === 404, detX.statusCode);
  const detBad = await dashA.inject({ method: "GET", url: "/v1/api-usage/payloads/not-a-uuid" });
  check("GET /payloads/:id with a malformed id -> 400", detBad.statusCode === 400, detBad.statusCode);

  section("(6) callback attempt row, url sanitised");
  const MSG = randomUUID();
  await recordCallbackAttempt(prisma, {
    organizationId: A, apiKeyId: credA.authId, url: "https://user:hunter2@hooks.example.com:8443/status/path?token=SECRETQ&x=1#frag", method: "POST",
    fields: { MessageUUID: MSG, Status: "sent", Sequence: "2" }, attempt: 1, outcome: "delivered", httpStatus: 200, durationMs: 42,
  });
  const att = await prisma.apiCallbackAttempt.findFirst({ where: { organizationId: A, messageId: MSG } });
  check("attempt row stored with url reduced to scheme+host+port+path (no userinfo, query or fragment)", att?.url === "https://hooks.example.com:8443/status/path", att?.url);
  check("attempt row has outcome, status, message id", att?.outcome === "delivered" && att.httpStatus === 200 && att.messageId === MSG, att);
  const cbA = (await dashA.inject({ method: "GET", url: `/v1/api-usage/callbacks?messageId=${MSG}` })).json() as { data: Array<{ id: string; url: string }> };
  const cbB = (await dashB.inject({ method: "GET", url: `/v1/api-usage/callbacks?messageId=${MSG}` })).json() as { data: unknown[] };
  check("GET /callbacks: org A sees the attempt, org B sees none", cbA.data.length === 1 && cbA.data[0]?.id === att?.id && cbB.data.length === 0, [cbA.data.length, cbB.data.length]);
  check("no stored attempt contains the query secret or the password", !(await dump()).includes("SECRETQ") && !(await dump()).includes("hunter2"));

  section("(7) 365-day cleanup deletes only the old rows");
  const old = new Date(Date.now() - 400 * DAY);
  const recent = new Date(Date.now() - 10 * DAY);
  const mkPay = (id: string, createdAt: Date) => ({ id, organizationId: A, method: "POST", endpoint: "message.send", statusCode: 202, outcome: "success", durationMs: 1, createdAt });
  const [oldPay, recentPay] = [randomUUID(), randomUUID()];
  await prisma.apiRequestPayload.createMany({ data: [mkPay(oldPay, old), mkPay(recentPay, recent)] });
  const mkAtt = (createdAt: Date) => ({ organizationId: A, apiKeyId: credA.authId, url: "https://example.com/x", method: "POST", fields: {}, outcome: "delivered", createdAt });
  const oldAtt = await prisma.apiCallbackAttempt.create({ data: mkAtt(old) });
  const recentAtt = await prisma.apiCallbackAttempt.create({ data: mkAtt(recent) });
  const before = { p: await prisma.apiRequestPayload.count(), a: await prisma.apiCallbackAttempt.count() };
  const deleted = await cleanupApiPayloads(prisma);
  const after = { p: await prisma.apiRequestPayload.count(), a: await prisma.apiCallbackAttempt.count() };
  check("deleted exactly 2 rows (one payload, one attempt), both 400 days old", deleted === 2 && after.p === before.p - 1 && after.a === before.a - 1, { deleted, before, after });
  check("the 10-day-old rows and today's rows survived, the 400-day-old rows are gone",
    (await prisma.apiRequestPayload.count({ where: { id: { in: [oldPay, recentPay] } } })) === 1 && !!(await pay(recentPay)) && !!(await pay(id202))
    && (await prisma.apiCallbackAttempt.findUnique({ where: { id: oldAtt.id } })) === null && !!(await prisma.apiCallbackAttempt.findUnique({ where: { id: recentAtt.id } })));

  section("(8) staff lookup: exactly one audit row, bodies printed only after it");
  const auditBefore = await prisma.apiPayloadAccessAudit.count();
  const order: string[] = [];
  const lines: string[] = [];
  const spy = {
    apiRequestPayload: prisma.apiRequestPayload as never,
    apiPayloadAccessAudit: { create: async (a: { data: Record<string, unknown> }) => { const r = await prisma.apiPayloadAccessAudit.create(a as never); order.push("audit"); return r; } },
  };
  const n = await runLookup(spy, { org: A, reason: "smoke test lookup", sinceHours: 24, showMeta: false, actor: "smoke" }, (l) => { order.push("print"); lines.push(l); });
  const auditRows = await prisma.apiPayloadAccessAudit.findMany({ orderBy: { createdAt: "desc" } });
  check("exactly one audit row written, with actor, org, reason and rows returned", auditRows.length === auditBefore + 1 && auditRows[0]?.organizationId === A && auditRows[0]?.actor === "smoke" && auditRows[0]?.reason === "smoke test lookup" && auditRows[0]?.rowsReturned === n, auditRows[0]);
  check("audit happened before the first printed line, and bodies were printed", order[0] === "audit" && order.filter((x) => x === "audit").length === 1 && order.length > 1 && lines.join("\n").includes("hello smoke"), order.slice(0, 3));
  check("lookup is org-scoped: org B's row is not printed", !lines.join("\n").includes(idB), n);

  section("(9) a duplicate payload id does not abort the batch; metering still commits");
  const D = `smoke-dup-${randomUUID().slice(0, 8)}`;
  const dupOrg = await mkOrg(D);
  const dupKey = (await prisma.apiKey.create({ data: { organizationId: dupOrg, name: D, keyHash: randomUUID(), scopes: [] } })).id;
  const [dupId, okId] = [randomUUID(), randomUUID()];
  await prisma.apiRequestPayload.create({ data: { ...mkPay(dupId, new Date()), organizationId: dupOrg, requestBody: "PRE-EXISTING" } });
  const snap = buildPayloadSnapshot({ body: { text: "dup test" }, url: "/x", responseText: '{"ok":true}', clientIp: null, userAgent: undefined });
  for (const logId of [dupId, okId]) {
    recordApiRequest({ method: "POST", routeUrl: "/v1/Account/:authId/Message/", statusCode: 202, durationMs: 5, requestId: "dup", messages: 1, organizationId: dupOrg, apiKeyId: dupKey, logId, payload: snap });
  }
  await flushApiUsage(prisma);
  const dupRow = await pay(dupId);
  const okRow = await pay(okId);
  check("the second payload row was inserted and the pre-existing duplicate was left untouched (skipDuplicates)", dupRow?.requestBody === "PRE-EXISTING" && okRow?.requestBody === JSON.stringify({ text: "dup test" }), [dupRow?.requestBody, okRow?.requestBody]);
  const raws = await prisma.apiRequestLog.count({ where: { id: { in: [dupId, okId] } } });
  const roll = (await prisma.$queryRaw<Array<{ requests: number; messages: number }>>`SELECT sum(requests)::int AS requests, sum(messages)::int AS messages FROM api_usage_daily WHERE organization_id = ${dupOrg}`)[0];
  check("both raw metadata rows and the rollup (2 requests, 2 messages) committed", raws === 2 && roll?.requests === 2 && roll?.messages === 2, { raws, roll });

  if (MIGRATION_DATABASE_URL) {
    section("(10) migration SQL vs prisma db push: table structure");
    const mig = new PrismaClient({ adapter: new PrismaPg({ connectionString: MIGRATION_DATABASE_URL }) });
    try {
      const cols = (p: PrismaClient) => p.$queryRaw<Array<Record<string, string>>>`
        SELECT table_name, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('api_request_payloads', 'api_callback_attempts', 'api_payload_access_audit')
         ORDER BY table_name, column_name`;
      const idx = (p: PrismaClient) => p.$queryRaw<Array<Record<string, string>>>`
        SELECT tablename, indexname, regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \\S+ ON ', '') AS def FROM pg_indexes
         WHERE schemaname = 'public' AND tablename IN ('api_request_payloads', 'api_callback_attempts', 'api_payload_access_audit') ORDER BY indexname`;
      const [cPush, cMig, iPush, iMig] = [await cols(prisma), await cols(mig), await idx(prisma), await idx(mig)];
      console.log(`      ${cPush.length} columns / ${iPush.length} indexes compared`);
      const strip = (rows: Array<Record<string, string>>) => JSON.stringify(rows.map(({ column_default: _d, ...rest }) => rest));
      check("columns, types and nullability are identical (3 tables)", cPush.length > 0 && strip(cPush) === strip(cMig), cPush.length - cMig.length);
      check("index names and definitions are identical", iPush.length > 0 && JSON.stringify(iPush) === JSON.stringify(iMig), [iPush.length, iMig.length]);
    } finally { await mig.$disconnect(); }
  } else {
    console.log("\nSKIP  (10) migration-vs-db-push comparison: SMOKE_MIGRATION_DATABASE_URL not set");
  }

  await Promise.all([app.close(), dashA.close(), dashB.close()]);
  await queues.redisConnection.quit().catch(() => undefined);
}

main()
  .catch((e) => { console.error("SMOKE CRASH:", e); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
