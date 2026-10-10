/**
 * MANUAL integration check of scripts/backfill-message-template-link.ts against a REAL throwaway Postgres.
 * Not part of `vitest run`. Runs the script as a subprocess (dry run, --org A --apply, second apply, global apply).
 *
 *   docker run -d --name pg-tpl-backfill -e POSTGRES_PASSWORD=smoke -p 15432:5432 postgres:16
 *   docker exec pg-tpl-backfill psql -U postgres -c "create database smoke_backfill"
 *   cd apps/api
 *   export DATABASE_URL=postgresql://postgres:smoke@127.0.0.1:15432/smoke_backfill
 *   pnpm prisma db push                       # (prisma 7 has no --skip-generate)
 *   pnpm tsx scripts/smoke-backfill-template-link.ts
 *   docker rm -f pg-tpl-backfill
 *
 * On Windows the range 55423-56022 can be excluded by Hyper-V/WSL, so avoid ports in it (15432 is fine).
 *
 * HARD GUARDS: DATABASE_URL must point at 127.0.0.1/localhost and a database whose name starts with "smoke"; DATABASE_PUBLIC_URL
 * is removed from the subprocess environment so the script can only ever reach that database. The script TRUNCATES
 * messages, templates, conversations and organizations at the start. Prints PASS/FAIL per check and "ALL CHECKS PASSED"
 * (exit 0) or "N CHECK(S) FAILED" (exit 1).
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const pgPort = process.env["SMOKE_PG_PORT"] ?? "15432";
const DATABASE_URL = process.env["DATABASE_URL"] ?? `postgresql://postgres:smoke@127.0.0.1:${pgPort}/smoke_backfill`;
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
const section = (s: string) => console.log(`\n== ${s}`);

function runScript(args: string[]): { code: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL };
  delete env["DATABASE_PUBLIC_URL"];
  const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/backfill-message-template-link.ts", ...args], { env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

type Snap = Record<string, { templateId: string | null; source: string | null }>;
async function snapshot(): Promise<Snap> {
  const rows = await prisma.message.findMany({ select: { id: true, templateId: true, source: true } });
  return Object.fromEntries(rows.map((r) => [r.id, { templateId: r.templateId, source: r.source }]));
}

async function main() {
  await prisma.$executeRaw`TRUNCATE api_message_meta, messages, conversations, templates, organizations CASCADE`;

  const A = (await prisma.organization.create({ data: { name: "Smoke Org A" } })).id;
  const B = (await prisma.organization.create({ data: { name: "Smoke Org B" } })).id;
  const tpl = (organizationId: string, name: string, language: string) =>
    prisma.template.create({ data: { organizationId, name, language, category: "utility" } }).then((t) => t.id);
  const tOne = await tpl(A, "tpl_one", "en");
  await tpl(A, "tpl_multi", "en");
  await tpl(A, "tpl_multi", "hi");
  const tFlow = await tpl(A, "tpl_flow", "en");
  const tOneB = await tpl(B, "tpl_one", "en");

  const convA = (await prisma.conversation.create({ data: { organizationId: A, whatsappContactId: "15550000001" } })).id;
  const convB = (await prisma.conversation.create({ data: { organizationId: B, whatsappContactId: "15550000002" } })).id;
  const json = (n: string) => JSON.stringify({ templateName: n, body: "hello" });
  const mk = (id: string, org: string, conv: string, body: string, extra: Record<string, unknown> = {}) =>
    prisma.message.create({ data: { id, organizationId: org, conversationId: conv, direction: "outbound", contentType: "template", body, ...extra } as never });
  await mk("a-dashboard", A, convA, json("tpl_one"));
  await mk("a-api", A, convA, json("tpl_one"));
  await prisma.apiMessageMeta.create({ data: { messageId: "a-api", apiKeyId: "k1", organizationId: A, dst: "15550000009" } });
  await mk("a-flow", A, convA, "tpl_flow");
  await mk("a-ambiguous", A, convA, json("tpl_multi"));
  await mk("a-unknown", A, convA, json("tpl_unknown"));
  await mk("a-linked", A, convA, json("tpl_one"), { templateId: "pre-existing", source: "dashboard" });
  await mk("a-campaign", A, convA, "Hello Anna", { richContent: { buttons: [] } });
  await prisma.message.create({ data: { id: "a-text", organizationId: A, conversationId: convA, direction: "outbound", contentType: "text", body: "tpl_one" } });
  await prisma.message.create({ data: { id: "a-inbound", organizationId: A, conversationId: convA, direction: "inbound", contentType: "template", body: "tpl_one" } });
  await mk("b-dashboard", B, convB, json("tpl_one"));

  const initial = await snapshot();
  const untouchedIds = ["a-ambiguous", "a-unknown", "a-linked", "a-campaign", "a-text", "a-inbound"];

  section("(1) dry run, all organizations");
  const dry = runScript([]);
  console.log(dry.stdout.trimEnd().split("\n").map((l) => `      ${l}`).join("\n"));
  check("exit code 0 and stderr empty", dry.code === 0 && dry.stderr === "", [dry.code, dry.stderr]);
  check("org A counts: to_update=3 ambiguous=1 unmatched=1 unattributed_campaign_candidates=1", dry.stdout.includes(`org ${A}: to_update=3 ambiguous=1 unmatched=1 unattributed_campaign_candidates=1`));
  check("org B counts: to_update=1", dry.stdout.includes(`org ${B}: to_update=1 ambiguous=0 unmatched=0`));
  check("TOTAL: to_update=4 ambiguous=1 unmatched=1", dry.stdout.includes("TOTAL: to_update=4 ambiguous=1 unmatched=1"));
  check("dry run changed nothing", JSON.stringify(await snapshot()) === JSON.stringify(initial));
  check("the connection string is never printed", !dry.stdout.includes("smoke@") && !dry.stderr.includes("smoke@"));

  section("(2) --org A --apply");
  const ap = runScript(["--org", A, "--apply"]);
  console.log(ap.stdout.trimEnd().split("\n").map((l) => `      ${l}`).join("\n"));
  const s2 = await snapshot();
  check("exit code 0, updated_rows=3", ap.code === 0 && ap.stdout.includes("updated_rows=3"), [ap.code, ap.stderr]);
  check("a-dashboard -> template tpl_one, source stays NULL", s2["a-dashboard"]?.templateId === tOne && s2["a-dashboard"]?.source === null, s2["a-dashboard"]);
  check("a-api -> template tpl_one, source api", s2["a-api"]?.templateId === tOne && s2["a-api"]?.source === "api", s2["a-api"]);
  check("a-flow -> template tpl_flow, source flow", s2["a-flow"]?.templateId === tFlow && s2["a-flow"]?.source === "flow", s2["a-flow"]);
  check("ambiguous, unknown, already-linked, campaign, text and inbound rows are unchanged", untouchedIds.every((id) => JSON.stringify(s2[id]) === JSON.stringify(initial[id])), untouchedIds.map((id) => s2[id]));
  check("a-linked still has its pre-existing template_id and source", s2["a-linked"]?.templateId === "pre-existing" && s2["a-linked"]?.source === "dashboard");
  check("org B's message untouched by A's run (same template name, other organization)", JSON.stringify(s2["b-dashboard"]) === JSON.stringify(initial["b-dashboard"]), s2["b-dashboard"]);

  section("(3) second --org A --apply is a no-op");
  const ap2 = runScript(["--org", A, "--apply"]);
  check("exit code 0, updated_rows=0, snapshot identical", ap2.code === 0 && ap2.stdout.includes("updated_rows=0") && JSON.stringify(await snapshot()) === JSON.stringify(s2), [ap2.code, ap2.stdout]);

  section("(4) global --apply links org B only (A already done), then no-op");
  const ap3 = runScript(["--apply"]);
  const s4 = await snapshot();
  check("updated_rows=1 and b-dashboard -> org B's own tpl_one (not A's)", ap3.code === 0 && ap3.stdout.includes("updated_rows=1") && s4["b-dashboard"]?.templateId === tOneB, [ap3.stdout, s4["b-dashboard"]]);
  const ap4 = runScript(["--apply"]);
  check("another global --apply updates 0 rows", ap4.code === 0 && ap4.stdout.includes("updated_rows=0") && JSON.stringify(await snapshot()) === JSON.stringify(s4));

  section("(5) failure modes");
  const bad = runScript(["--org"]);
  check("--org without a value exits non-zero with a fixed message", bad.code !== 0 && bad.stderr.includes("--org requires a value"), [bad.code, bad.stderr]);
}

main()
  .catch((e) => { console.error("SMOKE CRASH:", e instanceof Error ? e.name : e); failures++; })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
