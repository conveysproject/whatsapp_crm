// READ-ONLY audit for the own-auth migration (docs/prd-own-auth.md): how many customers sign in, and how often.
//
// Why: the cutover is a planned maintenance window; we need to know how active customers are today and how many
// accounts the Phase 5 import will cover.
//
// Safety: opens a READ ONLY transaction (the database rejects any write), prints counts only (no emails, names,
// phone numbers or IDs), and takes the connection string from the environment (never hardcode credentials).
// Our own orgs ("Conveys Information Technology", "Pooyan's Organization") are excluded from customer numbers.
//
// Usage (from apps/api, with the Postgres service's PUBLIC url in the environment):
//   railway run --service Postgres node scripts/audit-auth-readiness.mjs
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

const OWN_ORGS = ["Conveys Information Technology", "Pooyan's Organization"];
const CUSTOMER_USERS = `
  FROM users u JOIN organizations o ON o.id = u.organization_id
  WHERE u.role <> 'superAdmin' AND u.organization_id <> 'platform' AND o.name <> ALL($1::text[])`;

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const one = async (sql, params = [OWN_ORGS]) => (await client.query(sql, params)).rows[0];

  const users = await one(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE u.is_active AND u.deleted_at IS NULL)::int AS active,
      count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '1 day')::int AS signed_in_1d,
      count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '7 days')::int AS signed_in_7d,
      count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '30 days')::int AS signed_in_30d,
      count(*) FILTER (WHERE u.last_sign_in_at IS NULL)::int AS never_signed_in,
      count(*) FILTER (WHERE u.mobile_number IS NOT NULL AND u.mobile_number <> '')::int AS with_mobile
    ${CUSTOMER_USERS}`);
  const orgs = await one(`SELECT
      count(DISTINCT o.id)::int AS orgs_with_users,
      count(DISTINCT o.id) FILTER (WHERE u.last_sign_in_at > now() - interval '7 days')::int AS orgs_active_7d
    ${CUSTOMER_USERS}`);
  const roles = (await client.query(`SELECT u.role::text AS role, count(*)::int AS n ${CUSTOMER_USERS} GROUP BY 1 ORDER BY 1`, [OWN_ORGS])).rows;
  const admins = await one(`SELECT count(*)::int AS n FROM users WHERE role = 'superAdmin'`, []);
  const ownOrgUsers = await one(`SELECT count(*)::int AS n FROM users u JOIN organizations o ON o.id = u.organization_id WHERE o.name = ANY($1::text[])`);
  const logins = await one(`SELECT
      count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7d,
      count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30d,
      max(created_at) AS latest
    FROM login_logs`, []);
  const invites = await one(`SELECT count(*)::int AS pending FROM invitations WHERE status = 'pending' AND expires_at > now()`, []);
  const dupEmails = await one(`SELECT count(*)::int AS n FROM (
      SELECT lower(trim(email)) FROM users WHERE deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1) d`, []);

  console.log("Customer users (own orgs and super admins excluded):", users);
  console.log("Customer users by role:", roles);
  console.log("Customer orgs:", orgs);
  console.log("Super admins:", admins.n, "| users in our own orgs:", ownOrgUsers.n);
  console.log("login_logs (all, written by Clerk session webhook):", logins);
  console.log("Pending unexpired invitations:", invites.pending);
  console.log("Emails used by more than one non-deleted user (matters for the unique email in auth_accounts):", dupEmails.n);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
