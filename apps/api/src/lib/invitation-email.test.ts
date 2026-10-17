import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvitationEmail, invitationAcceptUrl } from "./invitation-email.js";

describe("invitation email", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("builds the accept url from WEB_URL, falling back to wbmsg.com", () => {
    vi.stubEnv("WEB_URL", "https://app.example.com/");
    expect(invitationAcceptUrl("tok")).toBe("https://app.example.com/invitations/tok/accept");
    vi.stubEnv("WEB_URL", "");
    delete process.env["WEB_URL"];
    expect(invitationAcceptUrl("tok")).toBe("https://wbmsg.com/invitations/tok/accept");
  });
  it("escapes the role and link", () => {
    const html = buildInvitationEmail({ role: "<b>x</b>", acceptUrl: 'https://a/"b' });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&quot;");
  });
});
