import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const tables = [
  'activityLog','adminAuditLog','apiKey','autoReply','botSession',
  'campaign','campaignGroup','campaignRecipient','campaignSegment',
  'cannedResponse','chatbot','contact','contactCustomField','contactCustomFieldValue',
  'contactGroup','contactImport','contactLabel','conversation','country',
  'creditLedger','deal','flow','flowRun','groupContact','impersonationLog',
  'infoMaterial','invitation','label','loginLog','manualSubscription',
  'mediaAsset','message','messageLabel','notification','orgTrustScoreSnapshot',
  'organization','organizationMember','page','pipeline','platformConfig',
  'responseWebhookAction','responseWebhookActionLog','routingRule','savedFilter',
  'segment','segmentContact','slaPolicy','team','template','ticket',
  'transaction','user','userDevice','vendorSetting','webhook',
  'webhookDeliveryLog','webhookLog','whatsappCall',
];

const withData = [];
const empty = [];

for (const t of tables) {
  try {
    const count = await prisma[t].count();
    if (count > 0) withData.push({ table: t, count });
    else empty.push(t);
  } catch (e) {
    withData.push({ table: t, count: 'ERR: ' + e.message?.split('\n')[0] });
  }
}

await prisma.$disconnect();

console.log('\n=== TABLES WITH DATA ===');
if (withData.length === 0) {
  console.log('(none)');
} else {
  for (const { table, count } of withData) console.log(`  ${table}: ${count}`);
}

console.log(`\n=== EMPTY (${empty.length} tables) ===`);
console.log(empty.join(', '));
