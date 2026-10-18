/**
 * Own-auth cutover (PRD §6.1): create one auth_accounts row per non-deleted users row.
 * id = users.id, normalized email marked verified, NO password, must_set_password = true
 * (each person sets a password on first sign-in or via Forgot password). No emails are sent.
 *
 * DRY RUN by default: prints counts and the user ids that would be created / are in conflict (never emails).
 * Writes only with --apply, in ONE transaction (createMany skipDuplicates; nothing is overwritten).
 *
 * Usage (DATABASE_PUBLIC_URL is injected by railway; never hard-code or print a connection string):
 *   railway run --service Postgres pnpm tsx scripts/import-auth-accounts.ts            # dry run
 *   railway run --service Postgres pnpm tsx scripts/import-auth-accounts.ts --apply    # write
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseArgs, planImport, type ImportPlan } from "./import-auth-accounts.helpers.js";

export function summarize(plan: ImportPlan, apply: boolean): string {
  return [
    `mode: ${apply ? "APPLY" : "dry run (no changes)"}`,
    `to create: ${plan.create.length} -> ${plan.create.map((a) => a.id).join(", ") || "-"}`,
    `already imported: ${plan.alreadyImported.length}`,
    `skipped (deleted users): ${plan.skippedDeleted.length}`,
    `conflicts: ${plan.conflicts.length}${plan.conflicts.map((c) => `\n  - ${c.userId}: ${c.reason}`).join("")}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const { apply } = parseArgs(process.argv.slice(2));
  const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_PUBLIC_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const users = await prisma.user.findMany({ select: { id: true, email: true, fullName: true, deletedAt: true } });
    const existing = await prisma.authAccount.findMany({ select: { id: true, email: true } });
    const plan = planImport(users, existing);
    console.log(summarize(plan, apply));
    if (!apply || plan.create.length === 0) return;
    const now = new Date();
    const created = await prisma.$transaction(async (tx) =>
      tx.authAccount.createMany({
        data: plan.create.map((a) => ({
          id: a.id,
          email: a.email,
          firstName: a.firstName,
          lastName: a.lastName,
          emailVerifiedAt: now,
          passwordHash: null,
          mustSetPassword: true,
          status: "active",
        })),
        skipDuplicates: true,
      }),
    );
    console.log(`created: ${created.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error("import failed:", err instanceof Error ? err.name + ": " + err.message.split("\n")[0] : "unknown error");
    process.exit(1);
  });
}
