/**
 * One-time backfill: creates a default "Sales Pipeline" for every org that
 * currently has no pipelines.
 *
 * Usage:
 *   --dry-run   (default) Print which orgs would be seeded without writing
 *   --apply     Write to the database
 *
 * Run from repo root:
 *   npx tsx apps/api/src/scripts/backfill-default-pipelines.ts [--apply]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDefaultPipeline } from "../lib/seed-default-pipeline.js";

const apply = process.argv.includes("--apply");

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });

  const orgsWithoutPipeline: Array<{ id: string; name: string }> = [];
  for (const org of orgs) {
    const count = await prisma.pipeline.count({ where: { organizationId: org.id } });
    if (count === 0) orgsWithoutPipeline.push(org);
  }

  if (orgsWithoutPipeline.length === 0) {
    console.info("All orgs already have at least one pipeline. Nothing to do.");
    return;
  }

  console.info(
    `${apply ? "Seeding" : "[DRY RUN] Would seed"} ${orgsWithoutPipeline.length} org(s):`
  );
  for (const org of orgsWithoutPipeline) {
    console.info(`  ${org.id}  ${org.name}`);
    if (apply) await seedDefaultPipeline(prisma, org.id);
  }

  if (!apply) console.info('\nRe-run with --apply to write to the database.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
