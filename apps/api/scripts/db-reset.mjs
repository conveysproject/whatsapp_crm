import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Tables to PRESERVE (seed/prefilled data)
const PRESERVE = new Set([
  'countries',
  'platform_configs',
  'organizations',
  'organization_members',
  'users',
]);

// All tables in safe deletion order (children before parents to avoid FK issues)
const ALL_TABLES = [
  // Leaf / junction tables first
  'activity_logs',
  'admin_audit_logs',
  'login_logs',
  'impersonation_logs',
  'org_trust_score_snapshots',
  'webhook_delivery_logs',
  'webhook_logs',
  'response_webhook_action_logs',
  'campaign_recipients',
  'campaign_segments',
  'segment_contacts',
  'contact_custom_field_values',
  'contact_labels',
  'message_labels',
  'group_contacts',
  'flow_runs',
  'bot_sessions',
  'whatsapp_calls',
  'notifications',
  'user_devices',
  // Mid-level
  'messages',
  'conversations',
  'contacts',
  'contact_imports',
  'contact_custom_fields',
  'contact_groups',
  'campaigns',
  'campaign_groups',
  'segments',
  'deals',
  'tickets',
  'flows',
  'chatbots',
  'auto_replies',
  'templates',
  'canned_responses',
  'labels',
  'vendor_settings',
  'saved_filters',
  'routing_rules',
  'sla_policies',
  'pipelines',
  'teams',
  'api_keys',
  'webhooks',
  'response_webhook_actions',
  'media_assets',
  'pages',
  'info_materials',
  'manual_subscriptions',
  'transactions',
  'credit_ledger',
  'invitations',
];

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

const toDelete = ALL_TABLES.filter(t => !PRESERVE.has(t));

console.log('\n=== DB RESET ===');
console.log('Preserving:', [...PRESERVE].join(', '));
console.log('Deleting', toDelete.length, 'tables\n');

// Disable FK triggers for the session so order doesn't matter
await prisma.$executeRawUnsafe('SET session_replication_role = replica;');

const results = {};
for (const table of toDelete) {
  try {
    const res = await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    results[table] = { status: 'deleted', rows: res };
    console.log(`✓ ${table} — ${res} rows deleted`);
  } catch (e) {
    results[table] = { status: 'error', error: e.message?.split('\n')[0] };
    console.error(`✗ ${table} — ERROR: ${e.message?.split('\n')[0]}`);
  }
}

await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
await prisma.$disconnect();

console.log('\n=== DONE ===');
console.log(JSON.stringify(results, null, 2));
