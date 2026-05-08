"use client";
import { JSX } from "react";

export const PERMISSION_GROUPS = [
  {
    key: "administrative",
    label: "Administrative",
    description: "Settings, subscription, team members, message log",
    subPermissions: [] as Array<{ key: string; label: string }>,
  },
  {
    key: "manage_contacts",
    label: "Manage Contacts",
    description: "View and edit contacts",
    subPermissions: [
      { key: "import_contacts", label: "Import contacts" },
      { key: "export_contacts", label: "Export contacts" },
      { key: "delete_contacts", label: "Delete contacts" },
      { key: "add_edit_contacts", label: "Add / edit contacts" },
      { key: "add_edit_delete_custom_contact_fields", label: "Manage custom fields" },
      { key: "add_edit_delete_archive_group", label: "Manage groups" },
    ],
  },
  { key: "manage_campaigns", label: "Manage Campaigns", description: "Create, schedule, run campaigns", subPermissions: [] as Array<{ key: string; label: string }> },
  { key: "messaging", label: "Messaging", description: "Chat and sync templates", subPermissions: [] as Array<{ key: string; label: string }> },
  {
    key: "manage_templates",
    label: "Manage Templates",
    description: "WhatsApp message templates",
    subPermissions: [
      { key: "add_edit_templates", label: "Add / edit templates" },
      { key: "delete_templates", label: "Delete templates" },
    ],
  },
  {
    key: "manage_bot_replies",
    label: "Manage Automation",
    description: "Bot replies and flow builder",
    subPermissions: [
      { key: "add_edit_bot_replies", label: "Add / edit bot replies" },
      { key: "delete_bot_replies", label: "Delete bot replies" },
      { key: "add_edit_bot_flows", label: "Add / edit bot flows" },
      { key: "delete_bot_flows", label: "Delete bot flows" },
      { key: "manage_bot_flow_builder", label: "Access flow builder" },
    ],
  },
  { key: "assigned_chats_only", label: "Assigned Chats Only", description: "Agent sees only their assigned conversations", subPermissions: [] as Array<{ key: string; label: string }> },
  { key: "hide_contact_phone_numbers", label: "Hide Phone Numbers", description: "Phone numbers hidden from this agent", subPermissions: [] as Array<{ key: string; label: string }> },
  { key: "hide_contact_emails", label: "Hide Emails", description: "Email addresses hidden from this agent", subPermissions: [] as Array<{ key: string; label: string }> },
];

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
        <div key={group.key} className="border rounded-lg p-4">
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
