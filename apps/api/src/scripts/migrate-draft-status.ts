/**
 * Migration: adds 'draft' to TemplateStatus enum and moves
 * unsubmitted templates (no metaTemplateId) to draft status.
 *
 * Usage (from apps/api):
 *   node_modules/.bin/tsx src/scripts/migrate-draft-status.ts          # dry run
 *   node_modules/.bin/tsx src/scripts/migrate-draft-status.ts --apply  # run on prod
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const apply = process.argv.includes("--apply");
const DB_URL = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const checkResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'TemplateStatus' AND e.enumlabel = 'draft'
    ) AS exists
  `;
  const alreadyExists = checkResult[0]?.exists;

  if (alreadyExists) {
    console.info("'draft' already exists in TemplateStatus enum.");
  } else {
    console.info("Will add 'draft' to TemplateStatus enum.");
  }

  const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM templates WHERE status = 'pending' AND meta_template_id IS NULL
  `;
  const count = Number(countResult[0]?.count ?? 0);
  console.info(`Will move ${count} unsubmitted pending template(s) to draft.`);

  if (!apply) {
    console.info("\n--- DRY RUN — add --apply to execute ---");
    return;
  }

  if (!alreadyExists) {
    await prisma.$executeRaw`ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'draft'`;
    console.info("✅ Added 'draft' to TemplateStatus enum.");
  }

  if (count > 0) {
    const updated = await prisma.$executeRaw`
      UPDATE templates SET status = 'draft' WHERE status = 'pending' AND meta_template_id IS NULL
    `;
    console.info(`✅ Moved ${updated} template(s) to draft status.`);
  }
}

main()
  .catch((err: unknown) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
