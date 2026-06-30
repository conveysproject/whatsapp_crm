/**
 * Migration: adds 'draft' to TemplateStatus enum and moves
 * unsubmitted templates (no metaTemplateId) to draft status.
 *
 * Usage (from apps/api):
 *   node_modules/.bin/tsx src/scripts/migrate-draft-status.ts          # dry run
 *   node_modules/.bin/tsx src/scripts/migrate-draft-status.ts --apply  # run on prod
 */
import pg from "pg";

const apply = process.argv.includes("--apply");
const DB_URL = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";

const client = new pg.Client({ connectionString: DB_URL });

async function main(): Promise<void> {
  await client.connect();

  // Check if 'draft' already exists
  const check = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'TemplateStatus' AND e.enumlabel = 'draft'
    ) AS exists
  `);
  const alreadyExists = check.rows[0]?.exists;

  if (alreadyExists) {
    console.info("'draft' already exists in TemplateStatus enum.");
  } else {
    console.info("Will add 'draft' to TemplateStatus enum.");
  }

  // Count templates that would be updated
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM templates WHERE status = 'pending' AND meta_template_id IS NULL`
  );
  const count = parseInt(countRes.rows[0]?.count ?? "0", 10);
  console.info(`Will move ${count} unsubmitted pending template(s) to draft.`);

  if (!apply) {
    console.info("\n--- DRY RUN — add --apply to execute ---");
    return;
  }

  if (!alreadyExists) {
    await client.query(`ALTER TYPE "TemplateStatus" ADD VALUE IF NOT EXISTS 'draft'`);
    console.info("✅ Added 'draft' to TemplateStatus enum.");
  }

  if (count > 0) {
    const result = await client.query(
      `UPDATE templates SET status = 'draft' WHERE status = 'pending' AND meta_template_id IS NULL`
    );
    console.info(`✅ Moved ${result.rowCount} template(s) to draft status.`);
  }
}

main()
  .catch((err: unknown) => { console.error(err); process.exit(1); })
  .finally(() => client.end());
