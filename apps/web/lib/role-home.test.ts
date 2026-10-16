import { describe, it, expect } from "vitest";
import { WHATSAPP_ADMIN_HOME, isPathAllowedForRole } from "./role-home";

describe("isPathAllowedForRole", () => {
  it("whatsappAdmin may only open the WhatsApp Account settings", () => {
    expect(isPathAllowedForRole("whatsappAdmin", WHATSAPP_ADMIN_HOME)).toBe(true);
    expect(isPathAllowedForRole("whatsappAdmin", "/settings/whatsapp-account/anything")).toBe(true);
    for (const p of ["/dashboard", "/inbox", "/templates", "/settings", "/settings/billing", "/settings/whatsapp-accountx"]) {
      expect(isPathAllowedForRole("whatsappAdmin", p)).toBe(false);
    }
  });

  it("other roles are not restricted here (permissions gate their pages)", () => {
    for (const role of ["admin", "manager", "agent", "viewer", "superAdmin"]) {
      expect(isPathAllowedForRole(role, "/dashboard")).toBe(true);
    }
  });
});
