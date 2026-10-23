import { describe, it, expect } from "vitest";
import {
  EMPTY_VALUES, EmailApiError, KEEP_PLACEHOLDER, PASSWORD_REENTER, PICKER_OPTIONS, UNKNOWN_REASON_TEXT,
  applyChoice, applySecurity, applySesRegion, applyTestOutcome, bannerInfo, clearFieldErrors, connectionChanged, describeSendReason,
  formFromSettings, hasUnsavedChanges, inferChoice, isEmailBusy, mapEmailError, mapTestError, providerFields, providerOf, secretLabel,
  secretPlaceholder, secretRule, testDisabledReason, toSaveBody, validateApiKey, validateEmailForm, validateFromAddress, validateFromName,
  validateHost, validateMailgunDomain, validatePort, validateReplyTo, validateSmtpPassword, validateUser,
  type EmailFormValues, type EmailSettings, type PickerId,
} from "./email-settings";
import { confirmReducer } from "./parent-orgs";
import { finishConfirm, startConfirm } from "./brand-settings";

const smtpStored = (over: Partial<EmailSettings> = {}): EmailSettings => ({
  provider: "smtp", fromAddress: "hello@acme.test", fromName: "Acme", replyTo: null, status: "unverified", lastError: null,
  lastTestedAt: null, consecutiveFailures: 0, hasCredentials: true,
  config: { host: "smtp.gmail.com", port: 587, security: "starttls", user: "me@acme.test" }, ...over,
});
const apiStored = (provider: string, config: EmailSettings["config"] = {}, over: Partial<EmailSettings> = {}): EmailSettings => ({
  provider, fromAddress: "hello@acme.test", fromName: null, replyTo: null, status: "verified", lastError: null, lastTestedAt: null,
  consecutiveFailures: 0, hasCredentials: true, config, ...over,
});
const vals = (over: Partial<EmailFormValues> = {}): EmailFormValues => ({
  ...formFromSettings(smtpStored()), ...over,
});

describe("picker", () => {
  it("has the SMTP presets then the email services, in order", () => {
    expect(PICKER_OPTIONS.filter((o) => o.group === "SMTP presets").map((o) => o.id)).toEqual(["gmail", "microsoft365", "ses", "godaddy", "zoho", "smtp"]);
    expect(PICKER_OPTIONS.filter((o) => o.group === "Email services").map((o) => o.id)).toEqual(["sendgrid", "mailgun", "postmark", "resend", "brevo", "sparkpost"]);
    expect(PICKER_OPTIONS.find((o) => o.id === "smtp")?.label).toBe("Other SMTP");
  });
  it("maps every SMTP preset to the smtp provider and services to themselves", () => {
    for (const id of ["gmail", "microsoft365", "ses", "godaddy", "zoho", "smtp"] as PickerId[]) expect(providerOf(id)).toBe("smtp");
    for (const id of ["sendgrid", "mailgun", "postmark", "resend", "brevo", "sparkpost"] as PickerId[]) expect(providerOf(id)).toBe(id);
  });
  it("choosing a preset fills host, port and security and clears the typed secret", () => {
    const v = applyChoice(vals({ secret: "typed", choice: "smtp", host: "x.example.com", port: "25" }), "godaddy");
    expect(v).toMatchObject({ choice: "godaddy", host: "smtpout.secureserver.net", port: "465", security: "ssl", secret: "" });
    expect(applyChoice(vals(), "microsoft365")).toMatchObject({ host: "smtp.office365.com", port: "587", security: "starttls" });
  });
  it("SES needs a region for the host; changing the region rewrites it", () => {
    const ses = applyChoice(vals(), "ses");
    expect(ses).toMatchObject({ host: "", port: "587", security: "starttls" });
    expect(applySesRegion(ses, "eu-west-1").host).toBe("email-smtp.eu-west-1.amazonaws.com");
    expect(applySesRegion(ses, "bad/../region").host).toBe("");
  });
  it("security other than plain clears the unencrypted confirmation", () => {
    expect(applySecurity(vals({ security: "plain", allowPlain: true }), "ssl").allowPlain).toBe(false);
    expect(applySecurity(vals({ allowPlain: true }), "plain").allowPlain).toBe(true);
  });
  it("infers the picker entry from stored settings", () => {
    expect(inferChoice("smtp", { host: "smtp.gmail.com" })).toBe("gmail");
    expect(inferChoice("smtp", { host: "SMTP.OFFICE365.COM" })).toBe("microsoft365");
    expect(inferChoice("smtp", { host: "email-smtp.us-east-1.amazonaws.com" })).toBe("ses");
    expect(inferChoice("smtp", { host: "mail.acme.test" })).toBe("smtp");
    expect(inferChoice("smtp", undefined)).toBe("smtp");
    expect(inferChoice("mailgun", { domain: "mg.acme.test" })).toBe("mailgun");
  });
});

describe("fields per provider (match the API config shapes)", () => {
  const table: [PickerId, string[]][] = [
    ["smtp", ["host", "port", "security", "user", "secret"]],
    ["gmail", ["host", "port", "security", "user", "secret"]],
    ["microsoft365", ["host", "port", "security", "user", "secret"]],
    ["godaddy", ["host", "port", "security", "user", "secret"]],
    ["zoho", ["host", "port", "security", "user", "secret"]],
    ["ses", ["sesRegion", "host", "port", "security", "user", "secret"]],
    ["mailgun", ["domain", "region", "secret"]],
    ["sendgrid", ["region", "secret"]],
    ["sparkpost", ["region", "secret"]],
    ["postmark", ["secret"]],
    ["resend", ["secret"]],
    ["brevo", ["secret"]],
  ];
  it.each(table)("%s", (choice, fields) => {
    expect(providerFields(choice)).toEqual(fields);
  });
  it("labels the credential", () => {
    expect(secretLabel("gmail")).toBe("Password");
    expect(secretLabel("ses")).toBe("SMTP password");
    expect(secretLabel("sendgrid")).toBe("API key");
  });
});

describe("write-only secrets", () => {
  it("never copies a secret from stored data into the form, even if the data has one", () => {
    const hostile = { ...smtpStored(), pass: "hunter2-secret", apiKey: "SG.leaked-key", config: { host: "smtp.gmail.com", port: 587, security: "starttls", user: "u@x.test", pass: "hunter2-secret", apiKey: "SG.leaked-key" } } as unknown as EmailSettings;
    const v = formFromSettings(hostile);
    expect(v.secret).toBe("");
    expect(JSON.stringify(v)).not.toContain("hunter2-secret");
    expect(JSON.stringify(v)).not.toContain("SG.leaked-key");
    const api = formFromSettings({ ...apiStored("sendgrid"), apiKey: "SG.leaked-key" } as unknown as EmailSettings);
    expect(JSON.stringify(api)).not.toContain("SG.leaked-key");
  });
  it("shows the keep placeholder only for the same provider with unchanged connection fields", () => {
    const s = smtpStored();
    expect(secretPlaceholder(formFromSettings(s), s)).toBe(KEEP_PLACEHOLDER);
    expect(secretPlaceholder({ ...formFromSettings(s), host: "smtp.other.test" }, s)).toBe("");
    expect(secretPlaceholder(applyChoice(formFromSettings(s), "sendgrid"), s)).toBe("");
    expect(secretPlaceholder(formFromSettings(s), null)).toBe("");
    expect(secretPlaceholder(formFromSettings(s), { ...s, hasCredentials: false })).toBe("");
    expect(secretPlaceholder(formFromSettings(s), { ...s, configReadable: false })).toBe("");
    const a = apiStored("sendgrid");
    expect(secretPlaceholder(formFromSettings(a), a)).toBe(KEEP_PLACEHOLDER);
  });
  it("a blank secret is left out of the request; a typed one is sent", () => {
    expect(JSON.stringify(toSaveBody(vals()))).not.toContain("pass");
    expect((toSaveBody(vals({ secret: "pw" })).config as Record<string, unknown>)["pass"]).toBe("pw");
    const api = formFromSettings(apiStored("sendgrid"));
    expect((toSaveBody(api).config as Record<string, unknown>)["apiKey"]).toBeUndefined();
    expect((toSaveBody({ ...api, secret: "SG.abcdefgh" }).config as Record<string, unknown>)["apiKey"]).toBe("SG.abcdefgh");
  });
});

describe("connection change requires the password again (mirrors the API)", () => {
  const s = smtpStored();
  const table: [string, Partial<EmailFormValues>, boolean][] = [
    ["unchanged", {}, false],
    ["host changed", { host: "smtp.evil.test" }, true],
    ["host case only", { host: "SMTP.Gmail.COM" }, false],
    ["host with spaces around", { host: "  smtp.gmail.com " }, false],
    ["port changed", { port: "465" }, true],
    ["security changed", { security: "ssl" }, true],
    ["allowPlain changed", { security: "plain", allowPlain: true }, true],
    ["user changed", { user: "other@acme.test" }, true],
    ["from address changed", { fromAddress: "other@acme.test" }, false],
    ["from name changed", { fromName: "Other" }, false],
  ];
  it.each(table)("%s", (_n, patch, changed) => {
    const v = vals(patch);
    expect(connectionChanged(v, s)).toBe(changed);
    const errs = validateEmailForm(v, s);
    if (changed) expect(errs.secret).toBe(PASSWORD_REENTER);
    else expect(errs.secret).toBeUndefined();
  });
  it("typing a new password clears the requirement", () => {
    expect(validateEmailForm(vals({ host: "smtp.other.test", secret: "new-pass" }), s).secret).toBeUndefined();
  });
  it("another provider or no stored credentials: the secret is simply required", () => {
    expect(validateEmailForm(vals(), null).secret).toBe("Password is required");
    expect(validateEmailForm(applyChoice(vals(), "sendgrid"), s).secret).toBe("API key is required");
    expect(secretRule(vals(), { ...s, configReadable: false })).toBe("required");
  });
  it("an API provider keeps its key even when the region or domain changes", () => {
    const a = apiStored("mailgun", { domain: "mg.acme.test", region: "us" });
    const v = { ...formFromSettings(a), region: "eu" as const, domain: "mg2.acme.test" };
    expect(secretRule(v, a)).toBe("keep");
    expect(validateEmailForm(v, a).secret).toBeUndefined();
  });
});

describe("validators", () => {
  const ok = null;
  it.each([
    ["smtp.gmail.com", ok], ["MAIL.Acme.test", ok], ["8.8.8.8", ok], ["2001:4860:4860::8888", ok],
    ["", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["localhost", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["https://smtp.x.test", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["smtp.x.test:587", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["smtp.x.test/", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["a.b.123", "SMTP host must be a hostname or IP address, without a scheme, port or path"],
    ["127.0.0.1", "This address is not allowed"], ["10.0.0.5", "This address is not allowed"],
    ["169.254.169.254", "This address is not allowed"], ["192.168.1.1", "This address is not allowed"],
    ["::1", "This address is not allowed"], ["fd00::1", "This address is not allowed"], ["::ffff:127.0.0.1", "This address is not allowed"],
  ])("host %j", (h, msg) => {
    expect(validateHost(h)).toBe(msg);
  });
  it.each([["25", ok], ["465", ok], ["587", ok], ["2525", ok], ["26", "x"], ["", "x"], ["58 7", "x"], ["0587x", "x"], ["-1", "x"]])("port %j", (p, msg) => {
    expect(validatePort(p) === null).toBe(msg === null);
  });
  it("username 1 to 255 without control characters", () => {
    expect(validateUser("a")).toBeNull();
    expect(validateUser("")).not.toBeNull();
    expect(validateUser("a".repeat(256))).not.toBeNull();
    expect(validateUser("a\nb")).not.toBeNull();
  });
  it("smtp password 1 to 512 without CR, LF or NUL; spaces allowed", () => {
    expect(validateSmtpPassword("abcd efgh ijkl")).toBeNull();
    expect(validateSmtpPassword("")).not.toBeNull();
    expect(validateSmtpPassword("x".repeat(513))).not.toBeNull();
    expect(validateSmtpPassword("a\r\nb")).not.toBeNull();
  });
  it("api key 8..512 printable ASCII", () => {
    expect(validateApiKey("SG.abc-DEF_123")).toBeNull();
    expect(validateApiKey("short")).not.toBeNull();
    expect(validateApiKey("x".repeat(513))).not.toBeNull();
    expect(validateApiKey("has space 12345")).not.toBeNull();
    expect(validateApiKey("clé-with-accent-123")).not.toBeNull();
    expect(validateApiKey("tab\tinside-key")).not.toBeNull();
  });
  it("mailgun domain is a hostname", () => {
    expect(validateMailgunDomain("mg.Acme.test")).toBeNull();
    for (const d of ["", "localhost", "a/b.test", "mg.acme.test:443", "-a.test"]) expect(validateMailgunDomain(d)).not.toBeNull();
  });
  it("from address uses the plain-email rule; reply-to is optional", () => {
    expect(validateFromAddress("a@b.co")).toBeNull();
    for (const a of ["", "a@b", "a b@c.co", "A <a@b.co>", "a@b.co,c@d.co", '"a"@b.co']) expect(validateFromAddress(a)).not.toBeNull();
    expect(validateReplyTo("")).toBeNull();
    expect(validateReplyTo("a@b.co")).toBeNull();
    expect(validateReplyTo("not an email")).not.toBeNull();
  });
  it("from name is optional, 2 to 60 characters, no angle brackets or hidden characters", () => {
    expect(validateFromName("")).toBeNull();
    expect(validateFromName("Acme, Inc.")).toBeNull();
    for (const n of ["A", "x".repeat(61), "<b>x</b>", "a​b", "a\nb"]) expect(validateFromName(n)).not.toBeNull();
  });
  it("a plain-text connection needs the explicit confirmation", () => {
    const v = vals({ security: "plain", port: "25", secret: "pw" });
    expect(validateEmailForm(v, null).allowPlain).toBeDefined();
    expect(validateEmailForm({ ...v, allowPlain: true }, null).allowPlain).toBeUndefined();
  });
  it("only validates the fields of the chosen provider", () => {
    const v = { ...EMPTY_VALUES, choice: "resend" as const, host: "", port: "", user: "", secret: "re_abcdefgh", fromAddress: "a@b.co" };
    expect(validateEmailForm(v, null)).toEqual({});
  });
  it("SES needs a valid region", () => {
    const v = applyChoice(vals({ secret: "pw", user: "AKIA" }), "ses");
    expect(validateEmailForm(v, null).sesRegion).toBeDefined();
    expect(validateEmailForm(applySesRegion(v, "us-east-1"), null).sesRegion).toBeUndefined();
  });
});

describe("save body", () => {
  it("smtp: normalised host, numeric port, allowPlain only for plain, empty optionals are null", () => {
    const b = toSaveBody(vals({ host: " SMTP.Gmail.com ", fromName: " ", replyTo: "", secret: "pw" }));
    expect(b).toEqual({
      provider: "smtp", config: { host: "smtp.gmail.com", port: 587, security: "starttls", user: "me@acme.test", pass: "pw" },
      fromAddress: "hello@acme.test", fromName: null, replyTo: null,
    });
    const plain = toSaveBody(vals({ security: "plain", allowPlain: true, port: "25" }));
    expect((plain.config as Record<string, unknown>)["allowPlain"]).toBe(true);
  });
  it("mailgun sends domain and region; postmark sends only the key", () => {
    const mg = toSaveBody({ ...EMPTY_VALUES, choice: "mailgun", domain: "MG.acme.test", region: "eu", secret: "key-abcdefgh", fromAddress: "a@b.co" });
    expect(mg.config).toEqual({ apiKey: "key-abcdefgh", domain: "mg.acme.test", region: "eu" });
    const pm = toSaveBody({ ...EMPTY_VALUES, choice: "postmark", secret: "tok-abcdefgh", fromAddress: "a@b.co" });
    expect(pm.config).toEqual({ apiKey: "tok-abcdefgh" });
  });
  it("detects unsaved changes", () => {
    const s = smtpStored();
    const base = formFromSettings(s);
    expect(hasUnsavedChanges(base, s)).toBe(false);
    expect(hasUnsavedChanges({ ...base, host: "SMTP.GMAIL.COM" }, s)).toBe(false);
    expect(hasUnsavedChanges({ ...base, secret: "x" }, s)).toBe(true);
    expect(hasUnsavedChanges({ ...base, fromName: "Other" }, s)).toBe(true);
    expect(hasUnsavedChanges({ ...base, port: "465" }, s)).toBe(true);
    expect(hasUnsavedChanges(base, null)).toBe(true);
    expect(hasUnsavedChanges(applyChoice(base, "sendgrid"), s)).toBe(true);
  });
});

describe("error mapping", () => {
  const e = (status: number, code: string, field?: string, message = "m") => new EmailApiError(status, code, message, field);
  it("maps field-named validation errors, including pass and apiKey to the secret field", () => {
    expect(mapEmailError(e(400, "VALIDATION_FAILED", "pass", PASSWORD_REENTER))).toEqual({ field: "secret", message: PASSWORD_REENTER });
    expect(mapEmailError(e(400, "VALIDATION_FAILED", "apiKey"))).toMatchObject({ field: "secret" });
    expect(mapEmailError(e(400, "VALIDATION_FAILED", "host"))).toMatchObject({ field: "host" });
    expect(mapEmailError(e(400, "VALIDATION_FAILED", "fromAddress"))).toMatchObject({ field: "fromAddress" });
  });
  it("a field name that is not a form field becomes a general message (also __proto__)", () => {
    for (const f of ["body", "config", "provider", "__proto__", "constructor"]) {
      expect(mapEmailError(e(400, "VALIDATION_FAILED", f)).field).toBeUndefined();
    }
  });
  it("503 uses the fixed unavailable text", () => {
    expect(mapEmailError(e(503, "EMAIL_PROVIDER_UNAVAILABLE", undefined, "server text")).message).toBe("Email connections are not available right now. Try again later.");
  });
  it("test errors", () => {
    expect(mapTestError(e(429, "RATE_LIMITED"))).toBe("You can send 5 test emails per hour");
    expect(mapTestError(e(409, "NO_RECIPIENT"))).toBe("Your user has no email address");
    expect(mapTestError(e(404, "NOT_CONFIGURED"))).toMatch(/Save your email settings/);
    expect(mapTestError(e(503, "EMAIL_PROVIDER_UNAVAILABLE"))).toMatch(/not available right now/);
    expect(mapTestError(new Error("x"))).toMatch(/Something went wrong/);
  });
});

describe("describeSendReason covers every reason the API can produce", () => {
  // Gathered from apps/api/src/lib/email/providers/*.ts, transport.ts, the SMTP relay mapping and routes/email-settings.ts.
  const reasons = [
    "HTTP 401: authentication failed", "HTTP 403: authentication failed, code 10", "HTTP 429: rate limited", "HTTP 408: rate limited",
    "HTTP 500: provider unavailable", "HTTP 503: provider unavailable, code 7", "HTTP 422: rejected by provider", "HTTP 400: rejected by provider, code 300",
    "rejected by provider, code 406", "unexpected redirect", "timeout", "network error", "could not read the provider response",
    "unexpected provider response", "invalid email address",
    "authentication failed", "connection failed", "certificate not trusted", "rejected by server", "temporary failure", "host not allowed",
    "invalid configuration", "send failed", "relay unavailable", "relay not authorised", "relay rejected request",
    "could not send the test email", "stored credentials cannot be read; save the settings again", "settings changed during the test",
  ];
  it.each(reasons)("%s", (r) => {
    const text = describeSendReason(r);
    expect(text).not.toBe(UNKNOWN_REASON_TEXT);
    expect(text.length).toBeGreaterThan(20);
  });
  it("gives a specific text per class", () => {
    expect(describeSendReason("authentication failed")).toMatch(/credentials/);
    expect(describeSendReason("certificate not trusted")).toMatch(/certificate/);
    expect(describeSendReason("connection failed")).toMatch(/connect/);
    expect(describeSendReason("host not allowed")).toMatch(/not allowed/);
    expect(describeSendReason("rejected by server")).toMatch(/rejected/);
    expect(describeSendReason("temporary failure")).toMatch(/temporary/);
    expect(describeSendReason("HTTP 429: rate limited")).toMatch(/limiting/);
    expect(describeSendReason("HTTP 502: provider unavailable")).toMatch(/not available/);
    expect(describeSendReason("relay unavailable")).toMatch(/relay/);
  });
  it("never echoes an unknown or hostile reason", () => {
    for (const r of ["<script>alert(1)</script>", "secret-token-123", "", null, undefined]) {
      expect(describeSendReason(r as string)).toBe(UNKNOWN_REASON_TEXT);
    }
  });
});

describe("status banner", () => {
  it("none saved", () => {
    expect(bannerInfo(null)).toMatchObject({ state: "none", title: "Not connected: emails are sent from our address" });
  });
  it("unverified (also what any save returns)", () => {
    const b = bannerInfo(smtpStored());
    expect(b.state).toBe("unverified");
    expect(b.title).toBe("Saved. Send a test email to turn it on");
    expect(b.detail).toMatch(/Only a connection that passed a test is used/);
  });
  it("unverified after a failed test shows the readable reason", () => {
    expect(bannerInfo(smtpStored({ lastError: "authentication failed" })).detail).toMatch(/last test failed.*credentials/i);
  });
  it("verified names the from address", () => {
    expect(bannerInfo(apiStored("sendgrid"))).toMatchObject({
      state: "verified", title: "Connected: your organization's emails are sent from hello@acme.test",
    });
  });
  it("failing explains the fallback and shows the reason in words", () => {
    const b = bannerInfo(smtpStored({ status: "failing", lastError: "HTTP 401: authentication failed" }));
    expect(b.state).toBe("failing");
    expect(b.title).toMatch(/sent from our address until you send a test email that succeeds/);
    expect(b.detail).toMatch(/credentials/);
    expect(b.detail).not.toMatch(/HTTP/);
  });
  it("applyTestOutcome verifies on success and records the failure otherwise", () => {
    const s = smtpStored({ status: "failing", lastError: "x", consecutiveFailures: 3 });
    expect(applyTestOutcome(s, { ok: true }, "t")).toMatchObject({ status: "verified", lastError: null, consecutiveFailures: 0, lastTestedAt: "t" });
    expect(applyTestOutcome(smtpStored(), { ok: false, status: "unverified", reason: "connection failed", retryable: true }, "t")).toMatchObject({ status: "unverified", lastError: "connection failed" });
    expect(applyTestOutcome(s, { ok: false, status: "failing", reason: "send failed", retryable: true }, "t").status).toBe("failing");
  });
});

describe("busy lock, test availability, confirm", () => {
  it("isEmailBusy", () => {
    expect(isEmailBusy({ saving: false, testing: false, removeState: "idle" })).toBe(false);
    expect(isEmailBusy({ saving: false, testing: false, removeState: "confirming" })).toBe(false);
    expect(isEmailBusy({ saving: true, testing: false, removeState: "idle" })).toBe(true);
    expect(isEmailBusy({ saving: false, testing: true, removeState: "idle" })).toBe(true);
    expect(isEmailBusy({ saving: false, testing: false, removeState: "running" })).toBe(true);
  });
  it("the test needs saved, unchanged settings and no running action", () => {
    expect(testDisabledReason({ saved: false, dirty: true, busy: false })).toMatch(/Save your settings first/);
    expect(testDisabledReason({ saved: true, dirty: true, busy: false })).toMatch(/Save your changes first/);
    expect(testDisabledReason({ saved: true, dirty: false, busy: true })).not.toBeNull();
    expect(testDisabledReason({ saved: true, dirty: false, busy: false })).toBeNull();
  });
  it("confirm: only the confirming state proceeds; a repeat while running does nothing; failure returns to confirming", () => {
    expect(confirmReducer("idle", "request")).toBe("confirming");
    expect(startConfirm("confirming")).toEqual({ proceed: true, next: "running" });
    expect(startConfirm("running")).toEqual({ proceed: false, next: "running" });
    expect(startConfirm("idle")).toEqual({ proceed: false, next: "idle" });
    expect(finishConfirm(true)).toBe("idle");
    expect(finishConfirm(false)).toBe("confirming");
  });
  it("clearFieldErrors drops only the edited fields", () => {
    expect(clearFieldErrors({ host: "a", port: "b", secret: "c" }, ["host"])).toEqual({ port: "b", secret: "c" });
  });
});
