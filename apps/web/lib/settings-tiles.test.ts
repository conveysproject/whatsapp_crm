import { describe, it, expect } from "vitest";
import { visibleSettingsTiles } from "./settings-tiles";

const u = (role: string, permissions: Record<string, string> = {}) => ({ id: "u", fullName: "U", email: "u@x.com", role, permissions });
const hrefs = (user: ReturnType<typeof u>) => visibleSettingsTiles(user).map((t) => t.href);

describe("visibleSettingsTiles", () => {
  it("admin sees every tile", () => {
    expect(hrefs(u("admin"))).toHaveLength(16);
  });

  it("manager with default permissions only sees tiles their APIs allow", () => {
    const manager = u("manager", {
      settings_access: "allow", "settings_access@settings_agents": "allow", "settings_access@settings_teams": "allow",
      "settings_access@settings_tags": "allow", contacts_access: "allow", automation_access: "allow",
      "automation_access@automation_bot_replies": "allow",
    });
    const visible = hrefs(manager);
    for (const hidden of ["/settings/roles", "/settings/branding", "/settings/whatsapp-account", "/settings/billing"]) {
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
  const withProvider = (value: string | undefined, fn: () => void) => {
    const prev = process.env["NEXT_PUBLIC_AUTH_PROVIDER"];
    if (value === undefined) delete process.env["NEXT_PUBLIC_AUTH_PROVIDER"]; else process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = value;
    try { fn(); } finally { if (prev === undefined) delete process.env["NEXT_PUBLIC_AUTH_PROVIDER"]; else process.env["NEXT_PUBLIC_AUTH_PROVIDER"] = prev; }
  };
  it("is shown to every signed-in role in wbmsg mode", () => {
    withProvider("wbmsg", () => {
      for (const role of ["admin", "manager", "agent"]) expect(hrefs(u(role))).toContain("/settings/security");
    });
  });
  it("is hidden in clerk mode and by default", () => {
    withProvider("clerk", () => expect(hrefs(u("admin"))).not.toContain("/settings/security"));
    withProvider(undefined, () => expect(hrefs(u("agent"))).not.toContain("/settings/security"));
  });
  it("is hidden while the user is unknown", () => {
    withProvider("wbmsg", () => expect(visibleSettingsTiles(null)).toEqual([]));
  });
});
