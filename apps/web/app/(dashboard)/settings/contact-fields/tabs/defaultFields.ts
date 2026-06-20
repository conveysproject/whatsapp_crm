export interface DefaultField {
  label: string;
  key: string;
  type: string;
}

// User-facing Contact columns surfaced read-only in the Default Fields panel.
export const DEFAULT_FIELDS: DefaultField[] = [
  { label: "Name", key: "name", type: "Text" },
  { label: "First Name", key: "first_name", type: "Text" },
  { label: "Last Name", key: "last_name", type: "Text" },
  { label: "Phone Number", key: "phone_number", type: "Number" },
  { label: "Email", key: "email", type: "Email" },
  { label: "Lead Status", key: "lead_status_id", type: "Selection List" },
  { label: "Language", key: "language_code", type: "Text" },
  { label: "Country Code", key: "country_code", type: "Text" },
  { label: "Username", key: "username", type: "Text" },
  { label: "Tags", key: "tags", type: "Tags" },
  { label: "Notes", key: "notes", type: "Text" },
  { label: "Account Owner", key: "assigned_user_id", type: "Selection List" },
  { label: "WhatsApp Opted Out", key: "whatsapp_opt_out", type: "Boolean" },
  { label: "Bot Disabled", key: "disable_bot", type: "Boolean" },
  { label: "WA Blocked At", key: "wa_blocked_at", type: "Date" },
  { label: "Phone Verified At", key: "phone_verified_at", type: "Date" },
  { label: "External ID", key: "external_id", type: "Text" },
  { label: "Created Date", key: "created_at", type: "Date" },
  { label: "Updated Date", key: "updated_at", type: "Date" },
];

// Confidential / internal columns intentionally NOT shown to users.
export const EXCLUDED_KEYS: string[] = [
  "id", "organization_id", "custom_fields", "country_id", "wa_id", "past_ai_summary", "deleted_at",
];
