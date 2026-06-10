import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const dbUrl = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!dbUrl) { console.error('No DATABASE_URL set'); process.exit(1); }
const ORG_ID = process.env.ORG_ID;
if (!ORG_ID) { console.error('No ORG_ID set'); process.exit(1); }

const adapter = new PrismaPg({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });
console.log('Org:', ORG_ID);

// ── Load existing IDs ─────────────────────────────────────────────────────────
const [templates, groups, segments] = await Promise.all([
  prisma.template.findMany({ where: { organizationId: ORG_ID }, select: { id: true, name: true } }),
  prisma.contactGroup.findMany({ where: { organizationId: ORG_ID }, select: { id: true, title: true } }),
  prisma.segment.findMany({ where: { organizationId: ORG_ID }, select: { id: true, name: true } }),
]);

const tpl  = (name) => templates.find(t => t.name.includes(name))?.id ?? null;
const grp  = (title) => groups.find(g => g.title === title)?.id;
const seg  = (name)  => segments.find(s => s.name === name)?.id;

const TMPL_PLAIN     = tpl('plain_text');
const TMPL_CAROUSEL  = tpl('carousel');
const TMPL_ORDER     = tpl('order_confirmation');
const TMPL_HELLO     = tpl('hello_world');
const TMPL_IMAGE_CTA = tpl('image_cta');

const GRP_VIP      = grp('VIP Customers');
const GRP_LEADS    = grp('New Leads');
const GRP_HOT      = grp('Hot Prospects');
const GRP_INACTIVE = grp('Inactive Contacts');
const GRP_TEST     = grp('Group Test');

const SEG_ALL_LEADS   = seg('All Leads');
const SEG_PROSPECTS   = seg('All Prospects');
const SEG_CUSTOMERS   = seg('Active Customers');
const SEG_LOYAL       = seg('Loyal Customers');
const SEG_CHURNED     = seg('Churned Contacts');
const SEG_LEADS_PROS  = seg('Leads or Prospects');

const now  = new Date();
const past = (days) => new Date(now - days * 86400_000);
const future = (days) => new Date(+now + days * 86400_000);

// ── Campaign definitions ──────────────────────────────────────────────────────
// Each entry: { campaign fields } + groupIds[] + segmentIds[]
const CAMPAIGNS = [
  // 1. Draft — marketing template, VIP group
  {
    name: 'VIP Exclusive Offer — Draft',
    campaignType: 'template',
    templateId: TMPL_IMAGE_CTA,
    status: 'draft',
    timezone: 'Asia/Kolkata',
    groupIds: [GRP_VIP],
    segmentIds: [],
  },

  // 2. Scheduled — plain text, All Leads segment, fires in 2 days
  {
    name: 'New Lead Nurture — Scheduled',
    campaignType: 'template',
    templateId: TMPL_PLAIN,
    status: 'scheduled',
    timezone: 'Asia/Kolkata',
    scheduledAt: future(2),
    messageInterval: 5,
    groupIds: [],
    segmentIds: [SEG_ALL_LEADS],
  },

  // 3. Running — carousel, Hot Prospects group
  {
    name: 'Hot Prospects Product Showcase — Running',
    campaignType: 'template',
    templateId: TMPL_CAROUSEL,
    status: 'running',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(0.1),
    sentAt: past(0.1),
    messageInterval: 10,
    groupIds: [GRP_HOT],
    segmentIds: [],
  },

  // 4. Completed — order confirmation, Group Test
  {
    name: 'Order Confirmation Blast — Completed',
    campaignType: 'template',
    templateId: TMPL_ORDER,
    status: 'completed',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(7),
    sentAt: past(7),
    groupIds: [GRP_TEST],
    segmentIds: [],
  },

  // 5. Completed — loyal customers re-engagement
  {
    name: 'Loyal Customer Appreciation — Completed',
    campaignType: 'template',
    templateId: TMPL_PLAIN,
    status: 'completed',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(14),
    sentAt: past(14),
    groupIds: [],
    segmentIds: [SEG_LOYAL],
  },

  // 6. Cancelled — was scheduled but cancelled
  {
    name: 'Monsoon Sale Blast — Cancelled',
    campaignType: 'template',
    templateId: TMPL_IMAGE_CTA,
    status: 'cancelled',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(3),
    groupIds: [GRP_LEADS, GRP_HOT],
    segmentIds: [],
  },

  // 7. Aborted — started but aborted mid-run
  {
    name: 'Re-engagement Winback — Aborted',
    campaignType: 'template',
    templateId: TMPL_PLAIN,
    status: 'aborted',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(5),
    sentAt: past(5),
    groupIds: [],
    segmentIds: [SEG_CHURNED],
  },

  // 8. Paused — running but paused
  {
    name: 'Prospects Follow-up — Paused',
    campaignType: 'template',
    templateId: TMPL_CAROUSEL,
    status: 'paused',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(1),
    sentAt: past(1),
    messageInterval: 30,
    groupIds: [],
    segmentIds: [SEG_PROSPECTS],
  },

  // 9. Draft — hello_world template, multi-segment audience
  {
    name: 'Hello World Broadcast — Draft',
    campaignType: 'template',
    templateId: TMPL_HELLO,
    status: 'draft',
    timezone: 'Asia/Kolkata',
    groupIds: [],
    segmentIds: [SEG_LEADS_PROS],
  },

  // 10. Scheduled — utility, inactive contacts, scheduled far future
  {
    name: 'Inactive Contact Win-back — Scheduled',
    campaignType: 'template',
    templateId: TMPL_PLAIN,
    status: 'scheduled',
    timezone: 'Asia/Kolkata',
    scheduledAt: future(7),
    messageInterval: 15,
    groupIds: [GRP_INACTIVE],
    segmentIds: [],
  },

  // 11. Completed — multi-group (VIP + Hot Prospects)
  {
    name: 'Diwali Special Campaign — Completed',
    campaignType: 'template',
    templateId: TMPL_IMAGE_CTA,
    status: 'completed',
    timezone: 'Asia/Kolkata',
    scheduledAt: past(30),
    sentAt: past(30),
    groupIds: [GRP_VIP, GRP_HOT],
    segmentIds: [],
  },

  // 12. Draft — customers segment, order follow-up
  {
    name: 'Post-Purchase Follow-up — Draft',
    campaignType: 'template',
    templateId: TMPL_ORDER,
    status: 'draft',
    timezone: 'Asia/Kolkata',
    groupIds: [],
    segmentIds: [SEG_CUSTOMERS],
  },
];

// ── Insert ────────────────────────────────────────────────────────────────────
console.log(`\nCreating ${CAMPAIGNS.length} campaigns...`);

for (const c of CAMPAIGNS) {
  const existing = await prisma.campaign.findFirst({ where: { organizationId: ORG_ID, name: c.name } });
  if (existing) { console.log(`  ~ "${c.name}" (already exists)`); continue; }

  const { groupIds, segmentIds, ...campaignData } = c;

  const created = await prisma.campaign.create({
    data: {
      organizationId: ORG_ID,
      ...campaignData,
      ...(groupIds.filter(Boolean).length > 0 && {
        campaignGroups: { create: groupIds.filter(Boolean).map(id => ({ contactGroupId: id })) },
      }),
      ...(segmentIds.filter(Boolean).length > 0 && {
        segments: { create: segmentIds.filter(Boolean).map(id => ({ segmentId: id })) },
      }),
    },
  });

  const audience = [
    ...groupIds.filter(Boolean).map(id => groups.find(g => g.id === id)?.title),
    ...segmentIds.filter(Boolean).map(id => segments.find(s => s.id === id)?.name),
  ].join(' + ');

  console.log(`  ✓ [${created.status.padEnd(9)}] "${created.name}" → ${audience || 'no audience'}`);
}

await prisma.$disconnect();
console.log('\nDone.');
