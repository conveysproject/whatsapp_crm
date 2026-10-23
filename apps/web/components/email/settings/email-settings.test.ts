import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailSettingsView, type EmailSettingsViewProps } from "./EmailSettingsView";
import {
  KEEP_PLACEHOLDER, applyChoice, formFromSettings, hasUnsavedChanges, type EmailFormValues, type EmailSettings, type PickerId,
} from "@/lib/email-settings";

const noop = () => undefined;
const stored = (over: Partial<EmailSettings> = {}): EmailSettings => ({
  provider: "smtp", fromAddress: "hello@acme.test", fromName: "Acme", replyTo: null, status: "unverified", lastError: null,
  lastTestedAt: null, consecutiveFailures: 0, hasCredentials: true,
  config: { host: "smtp.gmail.com", port: 587, security: "starttls", user: "me@acme.test" }, ...over,
});

function view(over: Partial<EmailSettingsViewProps> = {}, s: EmailSettings | null = stored()) {
  const values = over.values ?? formFromSettings(s);
  return renderToStaticMarkup(
    h(EmailSettingsView, {
      settings: s, values, errors: {}, formError: null, saving: false, testing: false, locked: false,
      dirty: hasUnsavedChanges(values, s), testMessage: null, removeState: "idle", removeError: null,
      onChange: noop, onChoice: noop, onSesRegion: noop, onSecurity: noop, onSave: noop, onTest: noop,
      onRequestRemove: noop, onCancelRemove: noop, onConfirmRemove: noop,
      ...over,
    }),
  );
}

const tag = (html: string, id: string) => new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? "";
const disabled = (html: string, id: string) => /disabled=""/.test(tag(html, id));
const testButton = (html: string) => /<button[^>]*data-testid="send-test"[^>]*>/.exec(html)?.[0] ?? "";
const mkValues = (choice: PickerId, over: Partial<EmailFormValues> = {}): EmailFormValues => ({ ...applyChoice(formFromSettings(null), choice), ...over });

describe("Email settings page", () => {
  it("has the title, the New badge and the picker groups", () => {
    const html = view({}, null);
    expect(html).toContain(">Email</h1>");
    expect(html).toContain("New");
    expect(html).toContain('<optgroup label="SMTP presets">');
    expect(html).toContain('<optgroup label="Email services">');
    for (const label of ["Gmail / Google Workspace", "Microsoft 365", "Amazon SES", "GoDaddy", "Zoho Mail", "Other SMTP", "SendGrid", "Mailgun", "Postmark", "Resend", "Brevo", "SparkPost"]) {
      expect(html).toContain(label);
    }
  });

  it("shows the help text: SPF/DKIM, privacy and where to find credentials", () => {
    const html = view({}, null);
    expect(html).toContain("set up SPF and DKIM for your sending domain");
    expect(html).toContain("we do not change your DNS");
    expect(html).toContain("sign-in codes and billing emails are sent through this connection");
    expect(html).toContain("we send from our address and tell you");
    expect(html).toContain("app password");
    expect(view({ values: mkValues("microsoft365") }, null)).toContain("SMTP AUTH must be enabled");
    expect(view({ values: mkValues("ses") }, null)).toContain("not your IAM access keys");
  });

  describe("fields per provider", () => {
    const ids = ["email-host", "email-port", "email-security", "email-user", "email-secret", "email-ses-region", "email-domain", "email-region"];
    const present = (html: string) => ids.filter((id) => html.includes(`id="${id}"`));
    it.each([
      ["gmail", ["email-host", "email-port", "email-security", "email-user", "email-secret"]],
      ["smtp", ["email-host", "email-port", "email-security", "email-user", "email-secret"]],
      ["ses", ["email-host", "email-port", "email-security", "email-user", "email-secret", "email-ses-region"]],
      ["mailgun", ["email-secret", "email-domain", "email-region"]],
      ["sendgrid", ["email-secret", "email-region"]],
      ["sparkpost", ["email-secret", "email-region"]],
      ["postmark", ["email-secret"]],
      ["resend", ["email-secret"]],
      ["brevo", ["email-secret"]],
    ] as [PickerId, string[]][])("%s", (choice, expected) => {
      expect(present(view({ values: mkValues(choice) }, null)).sort()).toEqual([...expected].sort());
    });
    it("a preset fills the host, port and security, which stay editable", () => {
      const html = view({ values: mkValues("godaddy") }, null);
      expect(tag(html, "email-host")).toContain('value="smtpout.secureserver.net"');
      expect(disabled(html, "email-host")).toBe(false);
      expect(html).toContain('<option value="465" selected="">465</option>');
      expect(html).toContain('<option value="ssl" selected="">');
    });
    it("labels the credential as password or API key", () => {
      expect(view({ values: mkValues("gmail") }, null)).toContain(">Password</label>");
      expect(view({ values: mkValues("ses") }, null)).toContain(">SMTP password</label>");
      expect(view({ values: mkValues("sendgrid") }, null)).toContain(">API key</label>");
    });
  });

  describe("write-only secrets", () => {
    const hostile = { ...stored(), pass: "hunter2-SECRET", apiKey: "SG.leaked-KEY", config: { ...stored().config, pass: "hunter2-SECRET", apiKey: "SG.leaked-KEY" } } as unknown as EmailSettings;
    it("never put a secret in the markup, even if the data has one", () => {
      const html = view({}, hostile);
      expect(html).not.toContain("hunter2-SECRET");
      expect(html).not.toContain("SG.leaked-KEY");
      expect(tag(html, "email-secret")).toContain('type="password"');
      expect(tag(html, "email-secret")).not.toMatch(/value="[^"]/);
      const api = view({}, { ...hostile, provider: "sendgrid", config: { region: "us" } });
      expect(api).not.toContain("SG.leaked-KEY");
    });
    it("show the keep placeholder only when the saved credentials still apply", () => {
      expect(tag(view({}), "email-secret")).toContain(`placeholder="${KEEP_PLACEHOLDER}"`);
      const changed = view({ values: { ...formFromSettings(stored()), host: "smtp.other.test" } });
      expect(tag(changed, "email-secret")).toContain('placeholder=""');
      expect(tag(view({ values: mkValues("sendgrid") }), "email-secret")).toContain('placeholder=""');
      expect(tag(view({}, null), "email-secret")).toContain('placeholder=""');
    });
    it("the only value in the secret box is what the person typed in this session", () => {
      const html = view({ values: { ...formFromSettings(stored()), secret: "typed-now" } });
      expect(tag(html, "email-secret")).toContain('value="typed-now"');
    });
  });

  describe("status banner", () => {
    it("none saved", () => {
      const html = view({}, null);
      expect(html).toContain('data-status="none"');
      expect(html).toContain("Not connected: emails are sent from our address");
    });
    it("unverified", () => {
      const html = view();
      expect(html).toContain('data-status="unverified"');
      expect(html).toContain("Saved. Send a test email to turn it on");
    });
    it("verified names the From address", () => {
      const html = view({}, stored({ status: "verified" }));
      expect(html).toContain('data-status="verified"');
      expect(html).toContain("Connected: your organization&#x27;s emails are sent from hello@acme.test");
    });
    it("failing explains the fallback and shows the reason in words", () => {
      const html = view({}, stored({ status: "failing", lastError: "authentication failed" }));
      expect(html).toContain('data-status="failing"');
      expect(html).toContain("sent from our address until you send a test email that succeeds");
      expect(html).toContain("refused the credentials");
      expect(html).not.toContain(">authentication failed<");
    });
  });

  describe("buttons", () => {
    it("the test needs saved and unchanged settings", () => {
      expect(testButton(view({}, null))).toContain('disabled=""');
      expect(testButton(view())).not.toContain('disabled=""');
      const dirty = view({ values: { ...formFromSettings(stored()), fromName: "Changed" } });
      expect(testButton(dirty)).toContain('disabled=""');
      expect(dirty).toContain("Save your changes first");
      expect(view({}, null)).toContain("Save your settings first");
    });
    it("Send test email to me label, and a pending label while testing", () => {
      expect(view()).toContain("Send test email to me");
      expect(view({ testing: true, locked: true })).toContain("Sending...");
    });
    it("Remove connection exists only when something is saved", () => {
      expect(view()).toContain("Remove connection");
      expect(view({}, null)).not.toContain("Remove connection");
    });
    it("shows the test result as text, success or failure", () => {
      const ok = view({ testMessage: { ok: true, text: "Test email sent." } });
      expect(ok).toContain('data-ok="true"');
      const bad = view({ testMessage: { ok: false, text: "You can send 5 test emails per hour" } });
      expect(bad).toContain('data-ok="false"');
      expect(bad).toContain("You can send 5 test emails per hour");
    });
  });

  describe("busy lock", () => {
    it.each([["saving", { saving: true }], ["testing", { testing: true }], ["removing", { removeState: "running" as const }]])("%s disables every control", (_n, over) => {
      const html = view({ locked: true, ...over });
      const enabled = (html.match(/<(input|select|button)\b[^>]*>/g) ?? []).filter((c) => !/disabled=""/.test(c));
      expect(enabled).toEqual([]);
    });
    it("not busy leaves the fields enabled", () => {
      const html = view();
      expect(disabled(html, "email-host")).toBe(false);
      expect(disabled(html, "email-provider")).toBe(false);
    });
  });

  describe("unencrypted connections", () => {
    it("the checkbox and warning appear only for security none", () => {
      expect(view()).not.toContain("Allow unencrypted connection");
      const html = view({ values: { ...formFromSettings(stored()), security: "plain", port: "25" } });
      expect(html).toContain("Allow unencrypted connection");
      expect(html).toContain("can expose your password");
    });
  });

  describe("errors and hostile values", () => {
    it("shows field errors and the form error as text with role alert", () => {
      const html = view({
        errors: { secret: "Re-enter the password when the server, port, security or username changes", host: "This address is not allowed" },
        formError: "Email connections are not available right now. Try again later.",
      });
      expect(html).toContain("Re-enter the password when the server, port, security or username changes");
      expect(html).toContain("This address is not allowed");
      expect(html).toContain("Email connections are not available right now. Try again later.");
      expect(html).toContain('role="alert"');
    });
    it("renders hostile stored and typed values as text only", () => {
      const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
      const s = stored({ fromAddress: evil, fromName: evil, lastError: evil, status: "verified", config: { host: evil, port: 587, security: "starttls", user: evil } });
      const html = view({ errors: { host: evil }, formError: evil, testMessage: { ok: false, text: evil } }, s);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).toContain("&lt;script&gt;");
    });
    it("a raw failure reason is never shown, only its readable text", () => {
      const html = view({}, stored({ status: "failing", lastError: "<script>evil</script> secret-token" }));
      expect(html).not.toContain("secret-token");
      expect(html).not.toContain("<script>");
    });
  });

  describe("remove confirmation", () => {
    it("no dialog while idle", () => {
      expect(view()).not.toContain('role="dialog"');
    });
    it("confirming shows the dialog with Remove enabled", () => {
      const html = view({ removeState: "confirming" });
      expect(html).toContain('role="dialog"');
      expect(html).toContain("Remove the email connection?");
      expect(html).toMatch(/<button type="button" class="[^"]*">Remove<\/button>/);
    });
    it("running shows the working state in the dialog", () => {
      expect(view({ removeState: "running", locked: true })).toContain("Working...");
    });
    it("shows a failed removal inside the dialog", () => {
      expect(view({ removeState: "confirming", removeError: "Something went wrong. Please try again." })).toContain("Something went wrong. Please try again.");
    });
  });
});
