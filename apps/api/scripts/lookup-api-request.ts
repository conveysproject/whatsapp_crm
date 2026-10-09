/**
 * Read-only staff lookup of stored public-API request/response payloads for ONE organization.
 * EVERY run writes one row to api_payload_access_audit (actor, organization, reason, exact filter, rows returned)
 * BEFORE any payload is printed. If the audit insert fails, nothing is printed and the exit code is non-zero.
 *
 * Usage (DATABASE_PUBLIC_URL is injected by railway; never hard-code or print a connection string):
 *   railway run --service Postgres pnpm tsx scripts/lookup-api-request.ts --org <orgId> --reason "<ticket or why, 8+ chars>" [--api-id <uuid>] [--since-hours 24] [--show-meta]
 *
 * Max 50 rows, newest first. Bodies are printed as stored (already redacted and size-capped).
 * --show-meta additionally prints client IP and user agent (off by default).
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseArgs, type LookupArgs } from "./lookup-api-request.args.js";

export const MAX_ROWS = 50;

interface PayloadRow {
  id: string;
  method: string;
  endpoint: string;
  statusCode: number;
  errorCode: string | null;
  durationMs: number;
  requestBody: string | null;
  responseBody: string | null;
  clientIp: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/** The slice of PrismaClient this script uses (lets tests pass a mock). */
export interface LookupPrisma {
  apiRequestPayload: { findMany(args: Record<string, unknown>): Promise<PayloadRow[]> };
  apiPayloadAccessAudit: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export async function runLookup(prisma: LookupPrisma, a: LookupArgs, out: (line: string) => void): Promise<number> {
  const since = new Date(Date.now() - a.sinceHours * 3_600_000);
  const rows = await prisma.apiRequestPayload.findMany({
    where: { organizationId: a.org, ...(a.apiId ? { id: a.apiId } : { createdAt: { gte: since } }) },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });
  // Audit first and fail closed: if this throws, nothing below is printed.
  await prisma.apiPayloadAccessAudit.create({
    data: {
      actor: a.actor,
      organizationId: a.org,
      reason: a.reason,
      query: JSON.stringify({ apiId: a.apiId ?? null, sinceHours: a.apiId ? null : a.sinceHours, showMeta: a.showMeta, limit: MAX_ROWS }),
      rowsReturned: rows.length,
    },
  });
  for (const r of rows) {
    out(`--- ${r.createdAt.toISOString()} ${r.method} ${r.endpoint} -> ${r.statusCode} ${r.errorCode ?? "-"} (api_id ${r.id}, ${r.durationMs} ms)`);
    if (a.showMeta) out(`META    : ip=${r.clientIp ?? "-"} ua=${r.userAgent ?? "-"}`);
    out(`REQUEST : ${r.requestBody ?? "(none)"}`);
    out(`RESPONSE: ${r.responseBody ?? "(none)"}`);
  }
  out(`\n${rows.length} row(s). Access recorded in api_payload_access_audit.`);
  return rows.length;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2)); // throws before connecting if args are invalid
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await runLookup(prisma as unknown as LookupPrisma, a, (l) => console.log(l));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // Never print e.message for DB errors: driver errors can embed the connection string. Our own arg/env errors are safe.
    const safe = e instanceof Error && /^(--|DATABASE_)/.test(e.message) ? e.message : `lookup failed (${e instanceof Error ? e.name : "error"})`;
    console.error(safe);
    process.exit(1);
  });
}
