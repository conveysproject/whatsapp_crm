/**
 * Re-subscribes the Meta webhook for a specific org using the correct callback URL.
 * Run with --apply to actually POST to Meta. Dry-run by default.
 *
 * Usage:
 *   tsx src/scripts/resubscribe-webhook.ts               # dry-run
 *   tsx src/scripts/resubscribe-webhook.ts --apply       # live
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DB = "postgresql://postgres:TWaGRPILYCQYOdRGipvyAtvpUfWRLSOK@trolley.proxy.rlwy.net:28192/railway";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB }) });
const ORG_ID = "org_3FoEbm5wEKZ6G8tMdhgT7Zksiu6";
const WA_GRAPH = "https://graph.facebook.com/v25.0";
const API_PUBLIC_URL = "https://wbmsg-production.up.railway.app";

const WA_SUBSCRIBED_FIELDS = [
  "messages",
  "message_template_quality_update",
  "message_template_status_update",
  "account_update",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
];

const apply = process.argv.includes("--apply");

async function q<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T>(sql) as Promise<T[]>;
}

async function main(): Promise<void> {
  // Load WABA credentials from vendor settings
  const settings = await q<{ key: string; value: string }>(
    `SELECT key, value FROM vendor_settings
     WHERE organization_id = '${ORG_ID}'
       AND key IN ('whatsapp_access_token', 'whatsapp_business_account_id')`
  );
  const vsMap: Record<string, string> = {};
  for (const s of settings) vsMap[s.key] = s.value;

  const accessToken = vsMap["whatsapp_access_token"];
  const wabaId = vsMap["whatsapp_business_account_id"];

  if (!accessToken || !wabaId) {
    console.error("Missing whatsapp_access_token or whatsapp_business_account_id in vendor_settings");
    process.exit(1);
  }

  const callbackUrl = `${API_PUBLIC_URL}/v1/webhooks/whatsapp`;
  const verifyToken = process.env["WA_VERIFY_TOKEN"] ?? "trustcrm_verify_2026";

  const body = {
    override_callback_uri: callbackUrl,
    verify_token: verifyToken,
    subscribed_fields: WA_SUBSCRIBED_FIELDS,
  };

  console.info("=== WEBHOOK RE-SUBSCRIBE ===");
  console.info(`  Org:          ${ORG_ID}`);
  console.info(`  WABA ID:      ${wabaId}`);
  console.info(`  Callback URL: ${callbackUrl}`);
  console.info(`  Verify token: ${verifyToken}`);
  console.info(`  Fields:       ${WA_SUBSCRIBED_FIELDS.join(", ")}`);
  console.info(`  URL:          POST ${WA_GRAPH}/${wabaId}/subscribed_apps`);

  if (!apply) {
    console.info("\n[DRY RUN] Pass --apply to actually POST to Meta.");
    return;
  }

  console.info("\n[LIVE] Posting to Meta...");
  const res = await fetch(`${WA_GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  console.info(`  Status: ${res.status}`);
  console.info(`  Body:   ${raw}`);

  if (res.ok) {
    // Update webhook_verified_at in our DB
    await q(
      `UPDATE vendor_settings SET value = '${new Date().toISOString()}'
       WHERE organization_id = '${ORG_ID}' AND key = 'webhook_verified_at'`
    );
    console.info("\n✅ Webhook re-subscribed. webhook_verified_at updated in DB.");
    console.info("Send a WhatsApp message TO +91 82691 50291 to test inbound delivery.");
  } else {
    console.error("\n❌ Meta returned an error. Check the body above.");
  }
}

main()
  .catch((e: unknown) => console.error(e))
  .finally(() => prisma.$disconnect());
