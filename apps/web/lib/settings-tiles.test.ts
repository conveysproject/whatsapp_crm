import { describe, it, expect } from "vitest";
import { visibleSettingsTiles } from "./settings-tiles";

const u = (role: string, permissions: Record<string, string> = {}) => ({ id: "u", fullName: "U", email: "u@x.com", role, permissions });
const hrefs = (user: ReturnType<typeof u>) => visibleSettingsTiles(user).map((t) => t.href);

describe("visibleSettingsTiles", () => {
  it("admin of a parent organization sees every tile", () => {
    expect(visibleSettingsTiles(u("admin"), { isParent: true })).toHaveLength(18);
  });

  it("admin of a non-parent sees every tile except Branding and Email", () => {
    for (const org of [undefined, null, {}, { isParent: false }, { hasParent: true }]) {
      const visible = visibleSettingsTiles(u("admin"), org).map((t) => t.href);
      expect(visible).toHaveLength(16);
      expect(visible).not.toContain("/settings/branding");
      expect(visible).not.toContain("/settings/email");
    }
  });

  it("manager with default permissions only sees tiles their APIs allow", () => {
    const manager = u("manager", {
      settings_access: "allow", "settings_access@settings_agents": "allow", "settings_access@settings_teams": "allow",
      "settings_access@settings_tags": "allow", contacts_access: "allow", automation_access: "allow",
      "automation_access@automation_bot_replies": "allow",
    });
    const visible = hrefs(manager);
    for (const hidden of ["/settings/roles", "/settings/branding", "/settings/email", "/settings/whatsapp-account", "/settings/billing"]) {
      expect(visible).not.toContain(hidden);
    }
    for (const shown of ["/settings/members", "/settings/teams", "/settings/labels", "/settings/contact-settings", "/settings/canned-responses", "/settings/routing"]) {
      expect(visible).toContain(shown);
    }
  });

  it("hides sub-gated tiles when the sub-permission is off", () => {
    const visible = hrefs(u("manager", { settings_access: "allow" }));
    expect(visible).not.toContain("/settings/members");
    expect(visible).not.toContain("/settings/teams");
    expect(visible).not.toContain("/settings/labels");
    expect(visible).toContain("/settings/notifications");
    expect(visible).not.toContain("/settings/inbox-labels");
    expect(visible).not.toContain("/settings/routing");
    expect(visible).not.toContain("/settings/webhook-actions");
  });

  it("shows nothing while the user is unknown", () => {
    expect(visibleSettingsTiles(null)).toEqual([]);
  });
});

describe("Security tile", () => {
  it("is shown to every signed-in role", () => {
    for (const role of ["admin", "manager", "agent"]) expect(hrefs(u(role))).toContain("/settings/security");
  });
  it("is hidden while the user is unknown", () => {
    expect(visibleSettingsTiles(null)).toEqual([]);
  });
});

describe("Branding tile", () => {
  const branding = (user: ReturnType<typeof u>, org?: { isParent?: boolean; hasParent?: boolean } | null) =>
    visibleSettingsTiles(user, org).find((t) => t.href === "/settings/branding");
  it("shows for an admin of a parent, marked New", () => {
    expect(branding(u("admin"), { isParent: true })?.isNew).toBe(true);
  });
  it("is hidden for managers and agents even in a parent", () => {
    for (const role of ["manager", "agent"]) expect(branding(u(role, { settings_access: "allow" }), { isParent: true })).toBeUndefined();
  });
  it("is hidden while the organization is unknown", () => {
    expect(branding(u("admin"), null)).toBeUndefined();
  });
});

describe("Email tile", () => {
  const email = (user: ReturnType<typeof u>, org?: { isParent?: boolean; hasParent?: boolean } | null) =>
    visibleSettingsTiles(user, org).find((t) => t.href === "/settings/email");
  it("shows for an admin of a parent, marked New, with its description", () => {
    const tile = email(u("admin"), { isParent: true });
    expect(tile?.isNew).toBe(true);
    expect(tile?.label).toBe("Email");
    expect(tile?.desc).toBe("Send your emails from your own address");
  });
  it.each([
    ["admin of a non-parent", u("admin"), { isParent: false }],
    ["admin of a client", u("admin"), { hasParent: true }],
    ["admin, org unknown", u("admin"), null],
    ["manager of a parent", u("manager", { settings_access: "allow" }), { isParent: true }],
    ["agent of a parent", u("agent"), { isParent: true }],
  ])("is hidden for %s", (_n, user, org) => {
    expect(email(user, org)).toBeUndefined();
  });
});
