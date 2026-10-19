import { afterEach, describe, expect, it, vi } from "vitest";
import { buildClientInvitationEmail, clientInvitationAcceptUrl, buildInvitationEmail, invitationAcceptUrl } from "./invitation-email.js";

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
  it("client invite email states the parent gets full read access, and escapes inputs", () => {
    const html = buildClientInvitationEmail({ parentName: "<i>Acme</i>", acceptUrl: 'https://a/"b' });
    expect(html).toContain("full read access");
    expect(html).toContain("has invited you to create your own WBMSG account");
    expect(html).not.toContain("join as");
    expect(html).not.toContain("<i>Acme</i>");
    expect(html).toContain("&lt;i&gt;Acme");
    expect(html).toContain("&quot;");
  });
  it("builds the client accept url", () => {
    vi.stubEnv("WEB_URL", "https://app.example.com/");
    expect(clientInvitationAcceptUrl("a b")).toBe("https://app.example.com/client-invitations/a%20b/accept");
  });
});
