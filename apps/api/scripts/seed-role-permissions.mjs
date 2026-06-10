import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Read the org from the already-saved superAdmin row
const superAdminRow = await prisma.vendorSetting.findFirst({
  where: { key: 'role_permissions_superAdmin' },
  select: { organizationId: true },
});

if (!superAdminRow) {
  console.error('No superAdmin permissions found — run from the org that already has superAdmin saved.');
  process.exit(1);
}

const { organizationId } = superAdminRow;
console.log('Organization:', organizationId);

const ROLES = {
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

for (const [role, permissions] of Object.entries(ROLES)) {
  const key = `role_permissions_${role}`;
  const value = JSON.stringify(permissions);
  await prisma.vendorSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value },
    update: { value },
  });
  console.log(`✓ ${role} — ${Object.keys(permissions).length} permissions saved`);
}

await prisma.$disconnect();
console.log('\nDone.');
