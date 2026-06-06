import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Default permissions — kept inline so the script is self-contained
const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    contacts_access: 'allow',
    'contacts_access@contacts_export': 'allow',
    'contacts_access@contacts_add': 'allow',
    'contacts_access@contacts_delete': 'allow',
    'contacts_access@contacts_bulk_tag': 'allow',
    'contacts_access@contacts_import': 'allow',
    'contacts_access@contacts_manage_custom_fields': 'allow',
    hide_phone_number: 'allow',
    'hide_phone_number@hide_contact_fields': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    'inbox_access@assigned_chats_only': 'allow',
    campaigns_access: 'allow',
    'campaigns_access@campaigns_create': 'allow',
    'campaigns_access@campaigns_export_report': 'allow',
    'campaigns_access@campaigns_custom_reports': 'allow',
    'campaigns_access@campaigns_manage_segments': 'allow',
    templates_access: 'allow',
    'templates_access@templates_ai_buttons': 'allow',
    'templates_access@templates_create': 'allow',
    'templates_access@templates_edit': 'allow',
    'templates_access@templates_delete': 'allow',
    settings_access: 'allow',
    'settings_access@settings_agents': 'allow',
    'settings_access@settings_whatsapp': 'allow',
    'settings_access@settings_api_key': 'allow',
    'settings_access@settings_billing': 'allow',
    'settings_access@settings_tags': 'allow',
    analytics_access: 'allow',
    'analytics_access@analytics_export': 'allow',
    'analytics_access@analytics_agent_performance': 'allow',
    automation_access: 'allow',
    'automation_access@automation_export_report': 'allow',
    'automation_access@automation_welcome_message': 'allow',
    'automation_access@automation_bot_flows': 'allow',
    'automation_access@automation_bot_replies': 'allow',
  },
  manager: {
    contacts_access: 'allow',
    'contacts_access@contacts_export': 'allow',
    'contacts_access@contacts_add': 'allow',
    'contacts_access@contacts_bulk_tag': 'allow',
    'contacts_access@contacts_import': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    campaigns_access: 'allow',
    'campaigns_access@campaigns_create': 'allow',
    'campaigns_access@campaigns_export_report': 'allow',
    'campaigns_access@campaigns_manage_segments': 'allow',
    templates_access: 'allow',
    'templates_access@templates_create': 'allow',
    'templates_access@templates_edit': 'allow',
    settings_access: 'allow',
    'settings_access@settings_agents': 'allow',
    'settings_access@settings_tags': 'allow',
    analytics_access: 'allow',
    'analytics_access@analytics_export': 'allow',
    'analytics_access@analytics_agent_performance': 'allow',
    automation_access: 'allow',
    'automation_access@automation_export_report': 'allow',
    'automation_access@automation_welcome_message': 'allow',
    'automation_access@automation_bot_replies': 'allow',
  },
  agent: {
    contacts_access: 'allow',
    'contacts_access@contacts_add': 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_unassigned': 'allow',
    'inbox_access@assigned_chats_only': 'allow',
    templates_access: 'allow',
  },
  viewer: {
    contacts_access: 'allow',
    inbox_access: 'allow',
    'inbox_access@inbox_all_conversations': 'allow',
    campaigns_access: 'allow',
    templates_access: 'allow',
    analytics_access: 'allow',
    automation_access: 'allow',
  },
};

// Find all orgs
const allOrgs = await prisma.organization.findMany({ select: { id: true } });

// Find orgs that already have at least one role_permissions_* row
const existing = await prisma.vendorSetting.findMany({
  where: { key: { startsWith: 'role_permissions_' } },
  select: { organizationId: true },
  distinct: ['organizationId'],
});
const seededOrgIds = new Set(existing.map((r) => r.organizationId));

const toBackfill = allOrgs.filter((o) => !seededOrgIds.has(o.id));
console.log(
  `${allOrgs.length} total orgs — ${seededOrgIds.size} already seeded — ${toBackfill.length} need backfill`
);

for (const org of toBackfill) {
  const data = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, perms]) => ({
    organizationId: org.id,
    key: `role_permissions_${role}`,
    value: JSON.stringify(perms),
  }));
  await prisma.vendorSetting.createMany({ data, skipDuplicates: true });
  console.log(`✓ ${org.id} — seeded ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length} roles`);
}

await prisma.$disconnect();
console.log('\nDone.');
