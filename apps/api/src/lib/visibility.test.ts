import { describe, it, expect } from "vitest";
import { buildVisibilityWhere, type VisibilityAuth } from "./visibility.js";

const base: VisibilityAuth = { userId: "u1", role: "agent", teamId: null, teamRole: null, teamViewAll: false };

describe("buildVisibilityWhere", () => {
  it("returns undefined (all) for admin", () => {
    expect(buildVisibilityWhere({ ...base, role: "admin" }, [], "assignedUserId")).toBeUndefined();
  });
  it("returns undefined (all) for superAdmin and viewer", () => {
    expect(buildVisibilityWhere({ ...base, role: "superAdmin" }, [], "assignedUserId")).toBeUndefined();
    expect(buildVisibilityWhere({ ...base, role: "viewer" }, [], "assignedUserId")).toBeUndefined();
  });
  it("returns undefined (all) when team has viewAllContacts on", () => {
    expect(buildVisibilityWhere({ ...base, teamId: "t1", teamRole: "member", teamViewAll: true }, [], "assignedUserId")).toBeUndefined();
  });
  it("scopes a lead to own + unassigned + team members", () => {
    const w = buildVisibilityWhere({ ...base, role: "agent", teamId: "t1", teamRole: "lead" }, ["u1", "u2", "u3"], "assignedUserId");
    expect(w).toEqual({ OR: [{ assignedUserId: null }, { assignedUserId: { in: ["u1", "u2", "u3"] } }] });
  });
  it("scopes an unteamed manager to own + unassigned", () => {
    const w = buildVisibilityWhere({ ...base, role: "manager", teamId: null, teamRole: null }, [], "assignedUserId");
    expect(w).toEqual({ OR: [{ assignedUserId: null }, { assignedUserId: "u1" }] });
  });
  it("scopes a plain agent/member to own only", () => {
    expect(buildVisibilityWhere(base, [], "assignedUserId")).toEqual({ assignedUserId: "u1" });
    expect(buildVisibilityWhere({ ...base, teamId: "t1", teamRole: "member" }, ["u1", "u2"], "assignedUserId")).toEqual({ assignedUserId: "u1" });
  });
  it("uses the assignedTo field for conversations", () => {
    expect(buildVisibilityWhere(base, [], "assignedTo")).toEqual({ assignedTo: "u1" });
  });
});
