// READ-ONLY audit: which orgs have platform-controlled plan keys (plan_feature_* / plan_limit_*) in vendor_settings.
//
// Why: until a87a9d1, PUT /v1/vendor-settings upserted ANY key, so an org admin could set these for their own org.
// This lists every such row with its org and timestamps so a human can compare them with what each org actually pays for.
//
// Safety: opens a READ ONLY transaction (the database rejects any write), selects only the plan_% rows, prints no
// secrets. Takes the connection string from the environment (never hardcode credentials in scripts).
//
// Usage (from apps/api, with the Postgres service's PUBLIC url in the environment):
//   railway run --service Postgres node scripts/audit-plan-keys.mjs
import pg from "pg";

const url = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_PUBLIC_URL (or DATABASE_URL) in the environment.");
  process.exit(1);
}
const host = new URL(url).hostname;
if (host.endsWith(".railway.internal")) {
  console.error(`Host ${host} is only reachable from inside Railway. Use the Postgres service's DATABASE_PUBLIC_URL.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");

  const { rows: orgCount } = await client.query("SELECT count(*)::int AS n FROM organizations");
  const { rows } = await client.query(
    `SELECT o.name AS org, v.organization_id, v.key, v.value, v.created_at, v.updated_at
       FROM vendor_settings v
       JOIN organizations o ON o.id = v.organization_id
      WHERE v.key LIKE 'plan\\_%'
      ORDER BY v.updated_at DESC, o.name, v.key`
  );

  console.log(`organizations: ${orgCount[0].n}`);
  console.log(`plan_* rows:   ${rows.length} (across ${new Set(rows.map((r) => r.organization_id)).size} org(s))\n`);
  if (rows.length === 0) {
    console.log("No plan_feature_* / plan_limit_* rows exist: nothing was self-set through the old endpoint.");
  } else {
    console.table(
      rows.map((r) => ({
        org: r.org,
        organization_id: r.organization_id,
        key: r.key,
        value: r.value,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
      }))
    );
    const apiAccess = rows.filter((r) => r.key === "plan_feature_api_access" && ["1", "true"].includes(r.value));
    console.log(`\norgs with plan_feature_api_access ON: ${apiAccess.length}${apiAccess.length ? " -> " + apiAccess.map((r) => r.org).join(", ") : ""}`);
  }
  await client.query("ROLLBACK");
} finally {
  await client.end();
}
