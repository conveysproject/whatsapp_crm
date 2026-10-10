/**
 * Backfill Organization.stripeId from settings.stripeCustomerId for orgs where stripeId is null.
 *
 * SAFETY: run the dry run first (default, writes nothing). Run with --apply ONLY after the owner confirms.
 * Reads DATABASE_URL from the environment only; nothing derived from it is printed.
 * Output: counts and organization ids only (no settings, customer ids or emails).
 *
 *   railway run pnpm tsx scripts/backfill-stripe-id.ts            # dry run
 *   railway run pnpm tsx scripts/backfill-stripe-id.ts --apply    # writes
 */
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseBackfillArgs, planStripeIdBackfill, type BackfillOrg } from "../src/lib/billing/stripe-id-backfill.js";

async function main(): Promise<void> {
  const { apply } = parseBackfillArgs(process.argv.slice(2)); // throws before connecting if args are invalid
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const unset = await prisma.organization.findMany({
      where: { stripeId: null },
      select: { id: true, stripeId: true, settings: true },
    });
    const held = await prisma.organization.findMany({
      where: { stripeId: { not: null } },
      select: { id: true, stripeId: true },
    });
    const orgs: BackfillOrg[] = [...unset, ...held.map((h) => ({ ...h, settings: null }))];
    const { updates, conflicts } = planStripeIdBackfill(orgs);

    console.log(`${apply ? "APPLY: will update" : "DRY RUN: would update"} ${updates.length} org(s); conflicts: ${conflicts.length}`);
    if (updates.length) console.log(`org ids: ${updates.map((u) => u.id).join(", ")}`);
    for (const c of conflicts) console.log(`conflict org ids (skipped): ${c.orgIds.join(", ")}`);

    if (apply) {
      let changed = 0;
      for (const u of updates) {
        const r = await prisma.organization.updateMany({ where: { id: u.id, stripeId: null }, data: { stripeId: u.stripeId } });
        changed += r.count;
      }
      console.log(`updated ${changed} row(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    // Never print DB driver messages: they can embed the connection string.
    const safe = e instanceof Error && /^(Usage:|DATABASE_)/.test(e.message) ? e.message : `backfill failed (${e instanceof Error ? e.name : "error"})`;
    console.error(safe);
    process.exit(1);
  });
}
