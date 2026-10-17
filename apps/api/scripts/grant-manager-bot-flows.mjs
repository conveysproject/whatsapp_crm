// Give Managers the "build flows" permission (automation_access@automation_bot_flows) in orgs that
// still use the untouched signup copy of the manager permissions.
//
// Why: every new org saves a copy of each role's default permissions at signup (role_permissions_<role>
// in vendor_settings), and a saved copy is used exactly as stored. The manager default now includes
// bot-flows (owner decision 2026-10-17), but saved copies don't change by themselves.
//
// Only rows that are EXACTLY the previous manager default are updated, so orgs that customised their
// manager permissions keep them. Everything else is reported and left alone.
//
// Safety: dry run by default (READ ONLY transaction, nothing written). Pass --apply to write, in one
// transaction. Prints org names and counts only, never connection strings. Takes the connection
// string from the environment (never hardcode credentials).
//
// Usage (from apps/api):
//   railway run --service Postgres node scripts/grant-manager-bot-flows.mjs            # dry run
//   railway run --service Postgres node scripts/grant-manager-bot-flows.mjs --apply    # write
import pg from "pg";

const BOT_FLOWS = "automation_access@automation_bot_flows";

// The manager default as it was before bot-flows was added (apps/api/src/lib/default-role-permissions.ts).
const PREVIOUS_MANAGER_DEFAULT = {
  contacts_access: "allow",
  "contacts_access@contacts_export": "allow",
  "contacts_access@contacts_add": "allow",
  "contacts_access@contacts_bulk_tag": "allow",
  "contacts_access@contacts_import": "allow",
  inbox_access: "allow",
  "inbox_access@inbox_all_conversations": "allow",
  "inbox_access@inbox_unassigned": "allow",
  campaigns_access: "allow",
  "campaigns_access@campaigns_create": "allow",
  "campaigns_access@campaigns_pause_resume": "allow",
  "campaigns_access@campaigns_abort": "allow",
  "campaigns_access@campaigns_archive": "allow",
  "campaigns_access@campaigns_delete": "allow",
  "campaigns_access@campaigns_export_report": "allow",
  templates_access: "allow",
  "templates_access@templates_create": "allow",
  "templates_access@templates_edit": "allow",
  settings_access: "allow",
  "settings_access@settings_agents": "allow",
  "settings_access@settings_teams": "allow",
  "settings_access@settings_tags": "allow",
  analytics_access: "allow",
  "analytics_access@analytics_export": "allow",
  "analytics_access@analytics_agent_performance": "allow",
  automation_access: "allow",
  "automation_access@automation_export_report": "allow",
  "automation_access@automation_welcome_message": "allow",
  "automation_access@automation_ooo": "allow",
  "automation_access@automation_delayed_response": "allow",
  "automation_access@automation_bot_replies": "allow",
  deals_access: "allow",
  trust_score_access: "allow",
};

const apply = process.argv.includes("--apply");
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

function sameAs(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  const { rows } = await client.query(
    `SELECT v.organization_id, o.name AS org, v.value
       FROM vendor_settings v JOIN organizations o ON o.id = v.organization_id
      WHERE v.key = 'role_permissions_manager'
      ORDER BY o.name`
  );

  const toGrant = [];
  const already = [];
  const customised = [];
  const unreadable = [];
  for (const r of rows) {
    let perms;
    try { perms = JSON.parse(r.value ?? "{}"); } catch { unreadable.push(r); continue; }
    if (perms[BOT_FLOWS] === "allow") already.push(r);
    else if (sameAs(perms, PREVIOUS_MANAGER_DEFAULT)) toGrant.push({ ...r, perms });
    else customised.push(r);
  }

  const { rows: total } = await client.query("SELECT count(*)::int AS n FROM organizations");
  console.log(`mode: ${apply ? "APPLY" : "DRY RUN (nothing written)"}`);
  console.log(`organizations: ${total[0].n}; saved manager permission rows: ${rows.length}`);
  console.log(`  untouched default -> will get bot-flows: ${toGrant.length}`);
  console.log(`  already have bot-flows:                 ${already.length}`);
  console.log(`  customised (left alone):                ${customised.length}`);
  console.log(`  unreadable JSON (left alone):           ${unreadable.length}`);
  console.log(`  orgs with no saved row use the new default automatically: ${total[0].n - rows.length}`);
  if (customised.length) console.log(`\ncustomised orgs: ${customised.map((r) => r.org).join(", ")}`);

  if (apply) {
    for (const r of toGrant) {
      await client.query(
        `UPDATE vendor_settings SET value = $1, updated_at = now()
          WHERE organization_id = $2 AND key = 'role_permissions_manager'`,
        [JSON.stringify({ ...r.perms, [BOT_FLOWS]: "allow" }), r.organization_id]
      );
    }
    await client.query("COMMIT");
    console.log(`\nupdated ${toGrant.length} row(s). Managers pick it up within the auth cache TTL (60s).`);
  } else {
    await client.query("ROLLBACK");
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw err;
} finally {
  await client.end();
}
