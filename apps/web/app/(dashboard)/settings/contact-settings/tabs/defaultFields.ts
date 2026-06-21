export interface DefaultField {
  label: string;
  key: string;
  type: string;
  /** Whether this field can be hidden from contact forms */
  toggleable: boolean;
}

// User-facing Contact columns surfaced in the Default Fields panel.
export const DEFAULT_FIELDS: DefaultField[] = [
  { label: "Name", key: "name", type: "Text", toggleable: false },
  { label: "First Name", key: "first_name", type: "Text", toggleable: false },
  { label: "Last Name", key: "last_name", type: "Text", toggleable: false },
  { label: "Phone Number", key: "phone_number", type: "Number", toggleable: false },
  { label: "Email", key: "email", type: "Email", toggleable: true },
  { label: "Lead Status", key: "lead_status_id", type: "Selection List", toggleable: false },
  { label: "Language", key: "language_code", type: "Text", toggleable: true },
  { label: "Country Code", key: "country_code", type: "Text", toggleable: true },
  { label: "Username", key: "username", type: "Text", toggleable: true },
  { label: "Tags", key: "tags", type: "Tags", toggleable: true },
  { label: "Notes", key: "notes", type: "Text", toggleable: true },
  { label: "Account Owner", key: "assigned_user_id", type: "Selection List", toggleable: true },
  { label: "WhatsApp Opted Out", key: "whatsapp_opt_out", type: "Boolean", toggleable: true },
  { label: "Bot Disabled", key: "disable_bot", type: "Boolean", toggleable: true },
  { label: "WA Blocked At", key: "wa_blocked_at", type: "Date", toggleable: false },
  { label: "Phone Verified At", key: "phone_verified_at", type: "Date", toggleable: false },
  { label: "External ID", key: "external_id", type: "Text", toggleable: true },
  { label: "Created Date", key: "created_at", type: "Date", toggleable: false },
  { label: "Updated Date", key: "updated_at", type: "Date", toggleable: false },
];

// Confidential / internal columns intentionally NOT shown to users.
export const EXCLUDED_KEYS: string[] = [
  "id", "organization_id", "custom_fields", "country_id", "wa_id", "past_ai_summary", "deleted_at",
];
