import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

const ORG_ID = 'org_3EZR5aawRkXDVapkcm0n5rDk90y'; // Pooyan's Organization

// ── Groups ────────────────────────────────────────────────────────────────────

const GROUPS = [
  { title: 'VIP Customers',     description: 'High-value customers with repeat purchases' },
  { title: 'New Leads',         description: 'Leads added in the last 30 days' },
  { title: 'Hot Prospects',     description: 'Prospects actively engaged in conversations' },
  { title: 'Inactive Contacts', description: 'Contacts with no activity in 90+ days' },
  { title: 'Group Test',        description: 'Test group for import/export validation' },
];

console.log('\n=== Creating Contact Groups ===');
for (const g of GROUPS) {
  const existing = await prisma.contactGroup.findFirst({
    where: { organizationId: ORG_ID, title: g.title },
  });
  if (existing) {
    console.log(`  ~ ${g.title} (already exists)`);
    continue;
  }
  const created = await prisma.contactGroup.create({
    data: { organizationId: ORG_ID, title: g.title, description: g.description },
  });
  console.log(`  ✓ ${created.title} — ${created.id}`);
}

// ── Segments ──────────────────────────────────────────────────────────────────

const SEGMENTS = [
  {
    name: 'All Leads',
    match: 'all',
    filters: [{ field: 'lifecycleStage', operator: 'equals', value: 'lead' }],
  },
  {
    name: 'All Prospects',
    match: 'all',
    filters: [{ field: 'lifecycleStage', operator: 'equals', value: 'prospect' }],
  },
  {
    name: 'Active Customers',
    match: 'all',
    filters: [{ field: 'lifecycleStage', operator: 'equals', value: 'customer' }],
  },
  {
    name: 'Loyal Customers',
    match: 'all',
    filters: [{ field: 'lifecycleStage', operator: 'equals', value: 'loyal' }],
  },
  {
    name: 'Churned Contacts',
    match: 'all',
    filters: [{ field: 'lifecycleStage', operator: 'equals', value: 'churned' }],
  },
  {
    name: 'WhatsApp Opted Out',
    match: 'all',
    filters: [{ field: 'whatsappOptOut', operator: 'isTrue' }],
  },
  {
    name: 'Bot Disabled',
    match: 'all',
    filters: [{ field: 'disableBot', operator: 'isTrue' }],
  },
  {
    name: 'Leads or Prospects',
    match: 'any',
    filters: [
      { field: 'lifecycleStage', operator: 'equals', value: 'lead' },
      { field: 'lifecycleStage', operator: 'equals', value: 'prospect' },
    ],
  },
];

console.log('\n=== Creating Segments ===');
for (const s of SEGMENTS) {
  const existing = await prisma.segment.findFirst({
    where: { organizationId: ORG_ID, name: s.name },
  });
  if (existing) {
    console.log(`  ~ ${s.name} (already exists)`);
    continue;
  }
  const created = await prisma.segment.create({
    data: {
      organizationId: ORG_ID,
      name: s.name,
      match: s.match,
      filters: s.filters,
    },
  });
  console.log(`  ✓ ${created.name} — ${created.id}`);
}

await prisma.$disconnect();
console.log('\nDone.');
