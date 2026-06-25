"use client";
import { JSX } from "react";

export const PERMISSION_GROUPS = [
  {
    key: "contacts_access",
    label: "Contact Hub",
    description: "Access to the contacts section",
    subPermissions: [
      { key: "contacts_export", label: "Export Contacts" },
      { key: "contacts_add", label: "Add Contacts" },
      { key: "contacts_delete", label: "Delete Contacts" },
      { key: "contacts_bulk_tag", label: "Bulk tag Contacts" },
      { key: "contacts_import", label: "Import Contacts" },
      { key: "contacts_manage_custom_fields", label: "Manage custom fields" },
    ],
  },
  {
    key: "hide_phone_number",
    label: "Contact Data Privacy",
    description: "Phone numbers and field data visibility",
    subPermissions: [
      { key: "hide_phone_only",     label: "Hide phone number only" },
      { key: "hide_contact_fields", label: "Hide all contact field data (phone + email)" },
    ],
  },
  {
    key: "inbox_access",
    label: "Inbox",
    description: "Access to the shared inbox",
    subPermissions: [
      { key: "inbox_all_conversations", label: "Access All section" },
      { key: "inbox_unassigned", label: "Access Unassigned section" },
      { key: "assigned_chats_only", label: "See only assigned chats" },
    ],
  },
  {
    key: "campaigns_access",
    label: "Campaigns",
    description: "Create, schedule, and run campaigns",
    subPermissions: [
      { key: "campaigns_create", label: "Create / edit campaigns" },
      { key: "campaigns_pause_resume", label: "Pause / Resume campaigns" },
      { key: "campaigns_abort", label: "Abort campaigns" },
      { key: "campaigns_archive", label: "Archive / Unarchive campaigns" },
      { key: "campaigns_delete", label: "Delete campaigns" },
      { key: "campaigns_export_report", label: "Export Campaign Reports" },
    ],
  },
  {
    key: "templates_access",
    label: "Templates",
    description: "WhatsApp message templates",
    subPermissions: [
      { key: "templates_ai_buttons", label: "AI-suggested smart buttons" },
      { key: "templates_create", label: "Create templates" },
      { key: "templates_edit", label: "Edit templates" },
      { key: "templates_delete", label: "Delete templates" },
    ],
  },
  {
    key: "settings_access",
    label: "Settings",
    description: "Access to configuration sections",
    subPermissions: [
      { key: "settings_agents", label: "Agent settings" },
      { key: "settings_api_key", label: "API Key access" },
      { key: "settings_whatsapp", label: "WhatsApp Business Setup" },
      { key: "settings_billing", label: "Invoice & Billing" },
      { key: "settings_tags", label: "Manage Tags" },
    ],
  },
  {
    key: "analytics_access",
    label: "Chat Analytics",
    description: "Dashboards and reporting",
    subPermissions: [
      { key: "analytics_export", label: "Export Analytics data" },
      { key: "analytics_agent_performance", label: "View Agent Performance" },
    ],
  },
  {
    key: "automation_access",
    label: "Automation",
    description: "Bot flows and automation rules",
    subPermissions: [
      { key: "automation_export_report", label: "Export Workflow Reports" },
      { key: "automation_welcome_message", label: "Welcome Message settings" },
      { key: "automation_ooo", label: "Out of Office settings" },
      { key: "automation_delayed_response", label: "Delayed Response settings" },
      { key: "automation_bot_flows", label: "Create / edit bot flows" },
      { key: "automation_bot_replies", label: "Create / edit bot replies" },
    ],
  },
  {
    key: "deals_access",
    label: "Deals",
    description: "Access to the deals pipeline",
    subPermissions: [],
  },
  {
    key: "trust_score_access",
    label: "Trust Score",
    description: "Access to the trust score dashboard",
    subPermissions: [],
  },
] as const satisfies Array<{
  key: string;
  label: string;
  description: string;
  subPermissions: Array<{ key: string; label: string }>;
}>;

interface Props {
  permissions: Record<string, string>;
  onChange: (updated: Record<string, string>) => void;
}

export function PermissionsGrid({ permissions, onChange }: Props): JSX.Element {
  function toggle(key: string): void {
    const current = permissions[key] ?? "deny";
    onChange({ ...permissions, [key]: current === "allow" ? "deny" : "allow" });
  }

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.key} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm">{group.label}</p>
              <p className="text-xs text-gray-500">{group.description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(group.key)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                permissions[group.key] === "allow" ? "bg-green-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  permissions[group.key] === "allow" ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          {group.subPermissions.length > 0 && permissions[group.key] === "allow" && (
            <div className="mt-3 pl-3 border-l space-y-2">
              {group.subPermissions.map((sub) => {
                const subKey = `${group.key}@${sub.key}`;
                return (
                  <div key={subKey} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">{sub.label}</span>
                    <input
                      type="checkbox"
                      checked={permissions[subKey] === "allow"}
                      onChange={() => toggle(subKey)}
                      className="rounded"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
