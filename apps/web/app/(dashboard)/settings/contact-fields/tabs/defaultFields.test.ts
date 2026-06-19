import { describe, it, expect } from "vitest";
import { DEFAULT_FIELDS, EXCLUDED_KEYS } from "./defaultFields";

describe("DEFAULT_FIELDS", () => {
  it("lists the 19 user-facing contact fields", () => {
    expect(DEFAULT_FIELDS).toHaveLength(19);
  });

  it("includes core fields with correct keys and types", () => {
    const byKey = Object.fromEntries(DEFAULT_FIELDS.map((f) => [f.key, f]));
    expect(byKey["phone_number"]).toEqual({ label: "Phone Number", key: "phone_number", type: "Number" });
    expect(byKey["lifecycle_stage"]).toEqual({ label: "Status", key: "lifecycle_stage", type: "Selection List" });
    expect(byKey["email"]).toEqual({ label: "Email", key: "email", type: "Email" });
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
