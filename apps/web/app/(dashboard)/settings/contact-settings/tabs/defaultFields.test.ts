import { describe, it, expect } from "vitest";
import { DEFAULT_FIELDS, EXCLUDED_KEYS } from "./defaultFields";

describe("DEFAULT_FIELDS", () => {
  it("lists the 19 user-facing contact fields", () => {
    expect(DEFAULT_FIELDS).toHaveLength(19);
  });

  it("includes core fields with correct keys, types and toggleable flags", () => {
    const byKey = Object.fromEntries(DEFAULT_FIELDS.map((f) => [f.key, f]));
    expect(byKey["phone_number"]).toEqual({ label: "Phone Number", key: "phone_number", type: "Number", toggleable: false });
    expect(byKey["lead_status_id"]).toEqual({ label: "Lead Status", key: "lead_status_id", type: "Selection List", toggleable: false });
    expect(byKey["email"]).toEqual({ label: "Email", key: "email", type: "Email", toggleable: true });
    expect(byKey["assigned_user_id"]).toEqual({ label: "Account Owner", key: "assigned_user_id", type: "Selection List", toggleable: true });
  });

  it("excludes confidential / internal database fields", () => {
    const keys = new Set(DEFAULT_FIELDS.map((f) => f.key));
    for (const excluded of EXCLUDED_KEYS) {
      expect(keys.has(excluded)).toBe(false);
    }
    expect(EXCLUDED_KEYS).toEqual([
      "id", "organization_id", "custom_fields", "country_id", "wa_id", "past_ai_summary", "deleted_at",
    ]);
  });
});
