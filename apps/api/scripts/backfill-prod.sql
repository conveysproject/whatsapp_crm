-- Backfill role permissions for all orgs that don't have any yet
-- Idempotent: ON CONFLICT DO NOTHING, and the WHERE NOT EXISTS guards prevent re-inserting

INSERT INTO vendor_settings (id, organization_id, key, value, data_type, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  o.id,
  r.key,
  r.value,
  'string',
  NOW(),
  NOW()
FROM organizations o
CROSS JOIN (
  VALUES
    ('role_permissions_admin',   '{"contacts_access":"allow","contacts_access@contacts_export":"allow","contacts_access@contacts_add":"allow","contacts_access@contacts_delete":"allow","contacts_access@contacts_bulk_tag":"allow","contacts_access@contacts_import":"allow","contacts_access@contacts_manage_custom_fields":"allow","hide_phone_number":"allow","hide_phone_number@hide_contact_fields":"allow","inbox_access":"allow","inbox_access@inbox_all_conversations":"allow","inbox_access@inbox_unassigned":"allow","inbox_access@assigned_chats_only":"allow","campaigns_access":"allow","campaigns_access@campaigns_create":"allow","campaigns_access@campaigns_export_report":"allow","campaigns_access@campaigns_manage_segments":"allow","templates_access":"allow","templates_access@templates_ai_buttons":"allow","templates_access@templates_create":"allow","templates_access@templates_edit":"allow","templates_access@templates_delete":"allow","settings_access":"allow","settings_access@settings_agents":"allow","settings_access@settings_whatsapp":"allow","settings_access@settings_api_key":"allow","settings_access@settings_billing":"allow","settings_access@settings_tags":"allow","analytics_access":"allow","analytics_access@analytics_export":"allow","analytics_access@analytics_agent_performance":"allow","automation_access":"allow","automation_access@automation_export_report":"allow","automation_access@automation_welcome_message":"allow","automation_access@automation_bot_flows":"allow","automation_access@automation_bot_replies":"allow"}'),
    ('role_permissions_manager', '{"contacts_access":"allow","contacts_access@contacts_export":"allow","contacts_access@contacts_add":"allow","contacts_access@contacts_bulk_tag":"allow","contacts_access@contacts_import":"allow","inbox_access":"allow","inbox_access@inbox_all_conversations":"allow","inbox_access@inbox_unassigned":"allow","campaigns_access":"allow","campaigns_access@campaigns_create":"allow","campaigns_access@campaigns_export_report":"allow","campaigns_access@campaigns_manage_segments":"allow","templates_access":"allow","templates_access@templates_create":"allow","templates_access@templates_edit":"allow","settings_access":"allow","settings_access@settings_agents":"allow","settings_access@settings_tags":"allow","analytics_access":"allow","analytics_access@analytics_export":"allow","analytics_access@analytics_agent_performance":"allow","automation_access":"allow","automation_access@automation_export_report":"allow","automation_access@automation_welcome_message":"allow","automation_access@automation_bot_replies":"allow"}'),
    ('role_permissions_agent',   '{"contacts_access":"allow","contacts_access@contacts_add":"allow","inbox_access":"allow","inbox_access@inbox_unassigned":"allow","inbox_access@assigned_chats_only":"allow","templates_access":"allow"}'),
    ('role_permissions_viewer',  '{"contacts_access":"allow","inbox_access":"allow","inbox_access@inbox_all_conversations":"allow","campaigns_access":"allow","templates_access":"allow","analytics_access":"allow","automation_access":"allow"}')
) AS r(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_settings vs
  WHERE vs.organization_id = o.id
    AND vs.key LIKE 'role_permissions_%'
)
ON CONFLICT (organization_id, key) DO NOTHING;

-- Verify: show what was inserted
SELECT o.name, vs.key, LEFT(vs.value, 30) AS value_preview
FROM vendor_settings vs
JOIN organizations o ON o.id = vs.organization_id
WHERE vs.key LIKE 'role_permissions_%'
ORDER BY o.name, vs.key;
