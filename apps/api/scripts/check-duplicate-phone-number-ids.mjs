// READ-ONLY check: does any phone_number_id appear on more than one organization?
// Why: a unique index on organizations.phone_number_id is planned as a later, separate migration.
// Prints counts only (no tokens, no connection string). Connection comes from the environment.
//
// Usage: railway run --service Postgres node apps/api/scripts/check-duplicate-phone-number-ids.mjs
import pg from "pg";

const url = process.env["DATABASE_PUBLIC_URL"] ?? process.env["DATABASE_URL"];
if (!url) {
  throw new Error("Set DATABASE_PUBLIC_URL (or DATABASE_URL) in the environment.");
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const { rows } = await client.query(
    `SELECT phone_number_id, count(*)::int AS n
       FROM organizations
      WHERE phone_number_id IS NOT NULL
      GROUP BY phone_number_id
     HAVING count(*) > 1
      ORDER BY n DESC`,
  );
  console.log(`Duplicate phone_number_id values: ${rows.length}`);
  console.log(`Organizations involved: ${rows.reduce((a, r) => a + r.n, 0)}`);
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
