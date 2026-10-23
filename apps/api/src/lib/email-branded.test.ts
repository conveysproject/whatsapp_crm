import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("./mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { sendCodeEmail, sendPasswordChangedEmail } from "../auth/emails.js";
import {
  buildClientInvitationEmail,
  buildInvitationEmail,
  clientInvitationSubject,
  invitationSubject,
} from "./invitation-email.js";
import type { EmailBrand } from "./email-brand.js";

const LOGO = "https://cdn.example.com/brand/logo.png";
const brand = (over: Partial<EmailBrand> = {}): EmailBrand => ({
  name: "Acme Msgs",
  logoUrl: LOGO,
  supportEmail: "help@acme.test",
  hidePoweredBy: false,
  ...over,
});
const URL = "https://app.example.com/x/accept";

beforeEach(() => {
  vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
  sendMail.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/** Everything but the optional "Powered by WBMSG" line must be free of the product name and domain. */
function expectNoWbmsg(html: string): void {
  const stripped = html.replace(/Powered by WBMSG/g, "");
  expect(stripped).not.toMatch(/wbmsg/i);
}

type Out = { subject: string; html: string };
const builders: [string, (b: EmailBrand) => Promise<Out> | Out][] = [
  ...(["email_verify", "signin_email", "signin_whatsapp", "new_device", "password_reset", "phone_verify"] as const).map(
    (p): [string, (b: EmailBrand) => Promise<Out>] => [
      `code email ${p}`,
      async (b) => {
        sendMail.mockClear();
        await sendCodeEmail("a@b.com", p, "123456", undefined, b);
        return sendMail.mock.calls[0]![0];
      },
    ],
  ),
  [
    "code email with custom lead",
    async (b) => {
      sendMail.mockClear();
      await sendCodeEmail("a@b.com", "email_verify", "123456", "Finish signing in to WBMSG with Google.", b);
      return sendMail.mock.calls[0]![0];
    },
  ],
  [
    "password changed",
    async (b) => {
      sendMail.mockClear();
      await sendPasswordChangedEmail("a@b.com", b);
      return sendMail.mock.calls[0]![0];
    },
  ],
  ["team invitation", (b) => ({ subject: invitationSubject(b), html: buildInvitationEmail({ role: "admin", acceptUrl: URL, brand: b }) })],
  [
    "client invitation",
    (b) => ({
      subject: clientInvitationSubject(b),
      html: buildClientInvitationEmail({ parentName: "Parent Co", acceptUrl: URL, brand: b }),
    }),
  ],
];

describe.each(builders)("%s, branded", (_name, build) => {
  it("uses the brand name, logo, support email and powered-by; nothing else of WBMSG", async () => {
    const { subject, html } = await build(brand());
    expect(subject).toContain("Acme Msgs");
    expect(subject).not.toMatch(/wbmsg/i);
    expect(html).toContain("Acme Msgs");
    expect(html).toContain(`<img src="${LOGO}"`);
    expect(html).toContain('href="mailto:help@acme.test"');
    expect(html).toContain("Powered by WBMSG");
    expectNoWbmsg(html);
  });
  it("leaves no WBMSG at all when powered-by is hidden", async () => {
    const { html } = await build(brand({ hidePoweredBy: true }));
    expect(html).not.toMatch(/wbmsg/i);
  });
  it("falls back to a text wordmark for a non-allowed logo url", async () => {
    const { html } = await build(brand({ logoUrl: "https://evil.example/logo.png" }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Acme Msgs");
  });
  it("escapes a hostile brand name and logo url, and keeps CR/LF out of the subject", async () => {
    const { subject, html } = await build(
      brand({ name: 'Evil\r\nBcc: x@y.z"><script>alert(1)</script>', logoUrl: `${LOGO}?q="><script>alert(2)</script>` }),
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("&lt;script&gt;");
    expect(subject).not.toMatch(/[\r\n<>]/);
  });
  it("a missing support email gives no mailto", async () => {
    const { html } = await build(brand({ supportEmail: null }));
    expect(html).not.toContain("mailto:");
  });
});

describe("branded invitation wording", () => {
  it("client invite says the brand account and still carries the read-access notice", () => {
    const html = buildClientInvitationEmail({ parentName: "Parent Co", acceptUrl: URL, brand: brand() });
    expect(html).toContain("has invited you to create your own Acme Msgs account");
    expect(html).toContain("full read access");
  });
  it("subjects", () => {
    expect(invitationSubject(brand())).toBe("You've been invited to join Acme Msgs");
    expect(clientInvitationSubject(brand())).toBe("You've been invited to join Acme Msgs");
  });
  it("the default client subject keeps its wording and the branded one has no article", () => {
    expect(clientInvitationSubject()).toBe("You've been invited to create a WBMSG account");
    expect(invitationSubject()).toBe("You've been invited to join WBMSG");
    expect(clientInvitationSubject(brand())).not.toMatch(/ a Acme/);
  });
  it("the logo is shown on the team invite only as an img when allowed", () => {
    expect(buildInvitationEmail({ role: "admin", acceptUrl: URL, brand: brand() })).toContain(`src="${LOGO}"`);
  });
});

describe("mail extras on the code and password emails", () => {
  it("passes fromName and replyTo for a brand", async () => {
    await sendCodeEmail("a@b.com", "signin_email", "123456", undefined, brand());
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ fromName: "Acme Msgs", replyTo: "help@acme.test" });
    sendMail.mockClear();
    await sendPasswordChangedEmail("a@b.com", brand({ supportEmail: null }));
    const arg = sendMail.mock.calls[0]![0];
    expect(arg.fromName).toBe("Acme Msgs");
    expect("replyTo" in arg).toBe(false);
  });
});
