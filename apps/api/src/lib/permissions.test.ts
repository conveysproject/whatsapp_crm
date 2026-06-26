import { describe, it, expect } from "vitest";
import { canAccess, canAccessSub, shouldHidePhone, shouldHideContactFields } from "./permissions.js";
import { DEFAULT_ROLE_PERMISSIONS } from "./default-role-permissions.js";

describe("canAccess", () => {
  it("admin and superAdmin bypass all checks", () => {
    expect(canAccess("admin", {}, "contacts_access")).toBe(true);
    expect(canAccess("superAdmin", {}, "anything")).toBe(true);
  });

  it("non-admin with empty permissions is denied (deny-by-default)", () => {
    expect(canAccess("agent", {}, "contacts_access")).toBe(false);
  });

  it("non-admin allowed only when key === allow", () => {
    expect(canAccess("agent", { contacts_access: "allow" }, "contacts_access")).toBe(true);
    expect(canAccess("agent", { contacts_access: "deny" }, "contacts_access")).toBe(false);
    expect(canAccess("agent", { other: "allow" }, "contacts_access")).toBe(false);
  });
});

describe("canAccessSub", () => {
  it("admin bypasses", () => {
    expect(canAccessSub("admin", {}, "contacts_access", "contacts_export")).toBe(true);
  });

  it("denies when parent not allowed", () => {
    expect(canAccessSub("agent", { "contacts_access@contacts_export": "allow" }, "contacts_access", "contacts_export")).toBe(false);
  });

  it("allows only when parent AND sub are allow", () => {
    const perms = { contacts_access: "allow", "contacts_access@contacts_export": "allow" };
    expect(canAccessSub("agent", perms, "contacts_access", "contacts_export")).toBe(true);
  });

  it("denies when sub missing even if parent allowed", () => {
    expect(canAccessSub("agent", { contacts_access: "allow" }, "contacts_access", "contacts_export")).toBe(false);
  });

  it("non-admin with empty permissions is denied", () => {
    expect(canAccessSub("agent", {}, "contacts_access", "contacts_export")).toBe(false);
  });
});

describe("shouldHidePhone", () => {
  it("returns false when no privacy keys are set", () => {
    expect(shouldHidePhone({})).toBe(false);
  });

  it("returns true when hide_phone_only is allow", () => {
    expect(shouldHidePhone({ "hide_phone_number@hide_phone_only": "allow" })).toBe(true);
  });

  it("returns true when hide_contact_fields is allow", () => {
    expect(shouldHidePhone({ "hide_phone_number@hide_contact_fields": "allow" })).toBe(true);
  });

  it("returns true when both are allow (union)", () => {
    expect(
      shouldHidePhone({
        "hide_phone_number@hide_phone_only": "allow",
        "hide_phone_number@hide_contact_fields": "allow",
      })
    ).toBe(true);
  });

  it("returns false when keys are present but set to deny", () => {
    expect(
      shouldHidePhone({
        "hide_phone_number@hide_phone_only": "deny",
        "hide_phone_number@hide_contact_fields": "deny",
      })
    ).toBe(false);
  });
});

describe("shouldHideContactFields", () => {
  it("returns false when no privacy keys are set", () => {
    expect(shouldHideContactFields({})).toBe(false);
  });

  it("returns true when hide_contact_fields is allow", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_contact_fields": "allow" })).toBe(true);
  });

  it("returns false when only hide_phone_only is allow", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_phone_only": "allow" })).toBe(false);
  });

  it("returns false when hide_contact_fields is deny", () => {
    expect(shouldHideContactFields({ "hide_phone_number@hide_contact_fields": "deny" })).toBe(false);
  });
});

describe("DEFAULT_ROLE_PERMISSIONS", () => {
  it("grants settings_teams to admin and manager, not agent", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin["settings_access@settings_teams"]).toBe("allow");
    expect(DEFAULT_ROLE_PERMISSIONS.manager["settings_access@settings_teams"]).toBe("allow");
    expect(DEFAULT_ROLE_PERMISSIONS.agent["settings_access@settings_teams"]).toBeUndefined();
  });
});
