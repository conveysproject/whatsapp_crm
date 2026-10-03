import { describe, it, expect } from "vitest";
import { sortUsersForSupport, roleHint } from "./support-users";

const u = (id: string, role: string, isActive = true, fullName = id) => ({ id, email: `${id}@x.com`, fullName, role, isActive });

describe("sortUsersForSupport", () => {
  it("puts admins first, then manager, agent, viewer", () => {
    const out = sortUsersForSupport([u("v", "viewer"), u("a", "agent"), u("ad", "admin"), u("m", "manager")]);
    expect(out.map((x) => x.id)).toEqual(["ad", "m", "a", "v"]);
  });
  it("puts inactive users last even if admin", () => {
    const out = sortUsersForSupport([u("old", "admin", false), u("ag", "agent")]);
    expect(out.map((x) => x.id)).toEqual(["ag", "old"]);
  });
  it("sorts by name within a role and does not mutate the input", () => {
    const input = [u("b", "admin", true, "Bravo"), u("a", "admin", true, "Alpha")];
    const out = sortUsersForSupport(input);
    expect(out.map((x) => x.fullName)).toEqual(["Alpha", "Bravo"]);
    expect(input[0]!.fullName).toBe("Bravo");
  });
  it("unknown roles sort last", () => {
    expect(sortUsersForSupport([u("x", "weird"), u("v", "viewer")]).map((r) => r.id)).toEqual(["v", "x"]);
  });
});

describe("roleHint", () => {
  it("describes visibility per role", () => {
    expect(roleHint("admin")).toMatch(/everything/);
    expect(roleHint("agent")).toMatch(/own chats/);
    expect(roleHint("unknown")).toBeNull();
  });
});
