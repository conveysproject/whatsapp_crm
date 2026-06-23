import { describe, it, expect } from "vitest";
import { canAccess, canAccessSub } from "./permissions.js";

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
