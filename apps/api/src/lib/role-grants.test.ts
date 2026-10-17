import { describe, it, expect } from "vitest";
import { grantableRoles, canGrantRole } from "./role-grants.js";

describe("grantableRoles (no higher than own)", () => {
  it("admin and superAdmin can grant admin, the lower roles and whatsappAdmin", () => {
    for (const actor of ["admin", "superAdmin"]) {
      expect([...grantableRoles(actor)].sort()).toEqual(["admin", "agent", "manager", "viewer", "whatsappAdmin"]);
    }
  });

  it("anyone else (e.g. manager with settings_agents) can grant only manager/agent/viewer", () => {
    expect([...grantableRoles("manager")].sort()).toEqual(["agent", "manager", "viewer"]);
    expect(grantableRoles("whatsappAdmin")).toEqual(grantableRoles("manager"));
  });

  it("nobody can grant superAdmin", () => {
    expect(grantableRoles("superAdmin")).not.toContain("superAdmin");
  });
});

describe("canGrantRole", () => {
  it("manager cannot promote to admin or whatsappAdmin", () => {
    expect(canGrantRole("manager", "admin")).toBe(false);
    expect(canGrantRole("manager", "whatsappAdmin")).toBe(false);
    expect(canGrantRole("manager", "agent")).toBe(true);
  });

  it("checks the target's current role too: manager cannot demote an admin", () => {
    expect(canGrantRole("manager", "agent", "admin")).toBe(false);
    expect(canGrantRole("manager", "viewer", "agent")).toBe(true);
  });

  it("admin cannot change a superAdmin's role", () => {
    expect(canGrantRole("admin", "agent", "superAdmin")).toBe(false);
    expect(canGrantRole("admin", "whatsappAdmin", "agent")).toBe(true);
  });
});
