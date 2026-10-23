// Web helpers for the Email settings page (docs/prd-white-label-website.md section 5a). The API is the security
// boundary (parent admin only, validation, credentials encrypted at rest); everything here shapes requests,
// pre-checks inputs for a faster message, and decides what to show. Pure and unit-testable.
// Secrets are WRITE-ONLY: the API never returns them, and nothing here copies one into a form from stored data.
import { SMTP_PRESETS, isPublicAddress, normalizeIpv4Mapped, parseDottedQuadIpv4, parseIpv6, smtpPresetFor, type SmtpPresetId } from "@WBMSG/shared";
import { GENERIC_ERROR } from "./brand-settings";
import { isPlainEmail } from "./mail-from";
import type { ConfirmState } from "./parent-orgs";

export { GENERIC_ERROR };

// ── Providers and the picker ──
export const SERVICE_PROVIDERS = ["sendgrid", "mailgun", "postmark", "resend", "brevo", "sparkpost"] as const;
export type ServiceProvider = (typeof SERVICE_PROVIDERS)[number];
export type ProviderId = "smtp" | ServiceProvider;
export type PickerId = SmtpPresetId | "smtp" | ServiceProvider;
export type Security = "ssl" | "starttls" | "plain";

export const SMTP_PORT_OPTIONS = [25, 465, 587, 2525] as const;
export const SECURITY_OPTIONS: readonly { value: Security; label: string }[] = [
  { value: "ssl", label: "SSL/TLS (usually port 465)" },
  { value: "starttls", label: "STARTTLS (usually port 587)" },
  { value: "plain", label: "None (not encrypted)" },
];

const SERVICE_LABELS: Record<ServiceProvider, string> = {
  sendgrid: "SendGrid", mailgun: "Mailgun", postmark: "Postmark", resend: "Resend", brevo: "Brevo", sparkpost: "SparkPost",
};

export interface PickerOption { id: PickerId; label: string; group: "SMTP presets" | "Email services" }

export const PICKER_OPTIONS: readonly PickerOption[] = [
  { id: "gmail", label: "Gmail / Google Workspace", group: "SMTP presets" },
  { id: "microsoft365", label: SMTP_PRESETS.microsoft365.label, group: "SMTP presets" },
  { id: "ses", label: SMTP_PRESETS.ses.label, group: "SMTP presets" },
  { id: "godaddy", label: SMTP_PRESETS.godaddy.label, group: "SMTP presets" },
  { id: "zoho", label: SMTP_PRESETS.zoho.label, group: "SMTP presets" },
  { id: "smtp", label: "Other SMTP", group: "SMTP presets" },
  ...SERVICE_PROVIDERS.map((id): PickerOption => ({ id, label: SERVICE_LABELS[id], group: "Email services" })),
];

export function providerOf(choice: PickerId): ProviderId {
  return (SERVICE_PROVIDERS as readonly string[]).includes(choice) ? (choice as ServiceProvider) : "smtp";
}

export type FieldKey =
  | "host" | "port" | "security" | "allowPlain" | "user" | "secret" | "sesRegion" | "domain" | "region"
  | "fromAddress" | "fromName" | "replyTo";

/** The provider-specific fields shown for a picker choice, in order. These match the API's config shapes exactly. */
export function providerFields(choice: PickerId): FieldKey[] {
  if (providerOf(choice) === "smtp") {
    const base: FieldKey[] = ["host", "port", "security", "user", "secret"];
    return choice === "ses" ? ["sesRegion", ...base] : base;
  }
  if (choice === "mailgun") return ["domain", "region", "secret"];
  if (choice === "sendgrid" || choice === "sparkpost") return ["region", "secret"];
  return ["secret"];
}

/** The label of the write-only credential field. */
export function secretLabel(choice: PickerId): string {
  if (choice === "ses") return "SMTP password";
  return providerOf(choice) === "smtp" ? "Password" : "API key";
}

/** Where to find the credentials for a choice; plain words. */
export function providerHelp(choice: PickerId): string {
  if (Object.hasOwn(SMTP_PRESETS, choice)) return SMTP_PRESETS[choice as SmtpPresetId].help;
  switch (choice) {
    case "smtp": return "Ask your email provider for the SMTP server, port, username and password.";
    case "sendgrid": return "Create an API key with permission to send mail in SendGrid (Settings, API Keys). The From address must be a verified sender.";
    case "mailgun": return "Use the sending domain you verified in Mailgun and a sending API key. Pick the region of your Mailgun account.";
    case "postmark": return "Use a Server API token from your Postmark server. The From address must be a confirmed sender signature.";
    case "resend": return "Create an API key in Resend and verify your sending domain first.";
    case "brevo": return "Create an API key in Brevo (SMTP and API, API keys). The From address must be a validated sender.";
    default: return "Create an API key with permission to send mail in SparkPost. Pick the region of your SparkPost account.";
  }
}

export const SPAM_HELP = "To avoid spam folders, set up SPF and DKIM for your sending domain in your email provider; we do not change your DNS.";
export const PRIVACY_HELP =
  "Once white-label is approved for your organization, your clients' sign-in codes and billing emails are sent through this connection, so your email provider can see them; if it stops working we send from our address and tell you.";
export const PLAIN_WARNING = "Unencrypted connections can expose your password and your emails to anyone on the network. Use this only on a trusted network.";
export const PASSWORD_REENTER = "Re-enter the password when the server, port, security or username changes";
export const KEEP_PLACEHOLDER = "Saved: leave blank to keep";
export const UNAVAILABLE_MESSAGE = "Email connections are not available right now. Try again later.";
export const TEST_LIMIT_MESSAGE = "You can send 5 test emails per hour";
export const NO_RECIPIENT_MESSAGE = "Your user has no email address";

// ── Stored settings (GET) ──
export type EmailStatus = "unverified" | "verified" | "failing";

export interface EmailSettings {
  provider: string;
  fromAddress: string;
  fromName: string | null;
  replyTo: string | null;
  status: EmailStatus;
  lastError: string | null;
  lastTestedAt: string | null;
  consecutiveFailures: number;
  hasCredentials: boolean;
  /** Non-secret parts only. Absent when configReadable is false. */
  config?: { host?: string; port?: number; security?: string; allowPlain?: boolean; user?: string; domain?: string; region?: string };
  configReadable?: boolean;
}

export interface EmailFormValues {
  choice: PickerId;
  host: string;
  port: string;
  security: Security;
  allowPlain: boolean;
  user: string;
  /** Write-only: only what the person typed in this session. Never filled from stored data. */
  secret: string;
  sesRegion: string;
  domain: string;
  region: "us" | "eu";
  fromAddress: string;
  fromName: string;
  replyTo: string;
}
export type FormErrors = Partial<Record<FieldKey, string>>;

function presetValues(choice: PickerId, sesRegion: string): Pick<EmailFormValues, "host" | "port" | "security"> | null {
  if (!Object.hasOwn(SMTP_PRESETS, choice)) return null;
  const p = smtpPresetFor(choice, sesRegion);
  if (p) return { host: p.host, port: String(p.port), security: p.security };
  // SES with no valid region yet: port and security are known, the host waits for the region.
  const raw = SMTP_PRESETS[choice as SmtpPresetId];
  return { host: "", port: String(raw.port), security: raw.security };
}

export const EMPTY_VALUES: EmailFormValues = {
  choice: "gmail", host: "smtp.gmail.com", port: "587", security: "starttls", allowPlain: false, user: "", secret: "",
  sesRegion: "", domain: "", region: "us", fromAddress: "", fromName: "", replyTo: "",
};

const SES_HOST_RE = /^email-smtp\.([a-z0-9-]+)\.amazonaws\.com$/;

/** Which picker entry a stored connection corresponds to. */
export function inferChoice(provider: string, cfg: EmailSettings["config"]): PickerId {
  if ((SERVICE_PROVIDERS as readonly string[]).includes(provider)) return provider as ServiceProvider;
  const host = (cfg?.host ?? "").toLowerCase();
  const ses = SES_HOST_RE.exec(host);
  if (ses && smtpPresetFor("ses", ses[1]!)) return "ses";
  for (const id of ["gmail", "microsoft365", "godaddy", "zoho"] as const) {
    if (smtpPresetFor(id)?.host === host) return id;
  }
  return "smtp";
}

/** The initial form. Secrets are never copied: only non-secret fields are read, one by one. */
export function formFromSettings(s: EmailSettings | null): EmailFormValues {
  if (!s) return { ...EMPTY_VALUES };
  const cfg = s.config;
  const choice = inferChoice(s.provider, cfg);
  const base: EmailFormValues = {
    ...EMPTY_VALUES,
    choice,
    fromAddress: s.fromAddress, fromName: s.fromName ?? "", replyTo: s.replyTo ?? "",
  };
  if (providerOf(choice) === "smtp") {
    const security: Security = cfg?.security === "ssl" || cfg?.security === "starttls" || cfg?.security === "plain" ? cfg.security : "starttls";
    const host = cfg?.host ?? "";
    return {
      ...base,
      host, port: cfg?.port !== undefined ? String(cfg.port) : "587", security, allowPlain: cfg?.allowPlain === true,
      user: cfg?.user ?? "", sesRegion: SES_HOST_RE.exec(host.toLowerCase())?.[1] ?? "",
    };
  }
  return {
    ...base, host: "", port: "587", security: "starttls",
    domain: cfg?.domain ?? "", region: cfg?.region === "eu" ? "eu" : "us",
  };
}

/** Picking another entry: presets fill host, port and security (still editable); the secret is cleared. */
export function applyChoice(v: EmailFormValues, choice: PickerId): EmailFormValues {
  if (choice === v.choice) return v;
  const next: EmailFormValues = { ...v, choice, secret: "", allowPlain: false };
  const preset = presetValues(choice, next.sesRegion);
  return preset ? { ...next, ...preset } : next;
}

/** Changing the SES region rewrites the host. */
export function applySesRegion(v: EmailFormValues, region: string): EmailFormValues {
  const next = { ...v, sesRegion: region };
  const p = smtpPresetFor("ses", region);
  return { ...next, host: p ? p.host : "" };
}

/** Choosing a security other than "plain" clears the unencrypted confirmation. */
export function applySecurity(v: EmailFormValues, security: Security): EmailFormValues {
  return { ...v, security, allowPlain: security === "plain" ? v.allowPlain : false };
}

// ── Connection change and the write-only secret rules (mirror the API) ──
interface Connection { host: string; port: number | null; security: string; allowPlain: boolean; user: string }

/** Trimmed, lower-cased; an IPv4-mapped IPv6 literal becomes the plain IPv4 (the API stores it that way). */
const normHost = (h: string): string => {
  const host = h.trim().toLowerCase();
  return host.includes(":") ? (normalizeIpv4Mapped(host)?.address ?? host) : host;
};

function connectionOfValues(v: EmailFormValues): Connection {
  return {
    host: normHost(v.host), port: /^\d+$/.test(v.port.trim()) ? Number(v.port.trim()) : null,
    security: v.security, allowPlain: v.security === "plain" && v.allowPlain, user: v.user.trim(),
  };
}

function connectionOfStored(c: NonNullable<EmailSettings["config"]>): Connection {
  return { host: normHost(c.host ?? ""), port: typeof c.port === "number" ? c.port : null, security: c.security ?? "", allowPlain: c.allowPlain === true, user: c.user ?? "" };
}

/** True when the SMTP host, port, security, allowPlain or username differ from the stored values (host compared case-insensitively). */
export function connectionChanged(v: EmailFormValues, stored: EmailSettings): boolean {
  if (!stored.config) return true;
  const a = connectionOfValues(v);
  const b = connectionOfStored(stored.config);
  return a.host !== b.host || a.port !== b.port || a.security !== b.security || a.allowPlain !== b.allowPlain || a.user !== b.user;
}

/** Whether a blank secret keeps the stored one, or has to be typed again. */
export function secretRule(v: EmailFormValues, stored: EmailSettings | null): "keep" | "reenter" | "required" {
  if (!stored || !stored.hasCredentials || stored.configReadable === false || stored.provider !== providerOf(v.choice)) return "required";
  if (providerOf(v.choice) === "smtp") return connectionChanged(v, stored) ? "reenter" : "keep";
  return "keep"; // API providers send the key to a fixed host, so the stored key stays valid
}

export function secretPlaceholder(v: EmailFormValues, stored: EmailSettings | null): string {
  return secretRule(v, stored) === "keep" ? KEEP_PLACEHOLDER : "";
}

// ── Validators (mirror apps/api; the API has the final say) ──
const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const MAILGUN_HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// eslint-disable-next-line no-control-regex
const SMTP_CONTROL_RE = /[\u0000\r\n]/;
const BAD_NAME_RE = /[<>\p{Cc}\p{Cf}]/u;

/** A hostname (2+ labels, non-numeric last label) or an IP literal. */
function isValidHostFormat(host: string): boolean {
  if (host.length < 1 || host.length > 253) return false;
  if (host.includes(":")) return parseIpv6(host) !== null;
  if (parseDottedQuadIpv4(host)) return true;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return false;
  const tld = labels[labels.length - 1]!;
  return !/^\d+$/.test(tld) && !tld.startsWith("0x");
}

export function validateHost(raw: string): string | null {
  const host = normHost(raw);
  if (!isValidHostFormat(host)) return "SMTP host must be a hostname or IP address, without a scheme, port or path";
  if ((host.includes(":") || parseDottedQuadIpv4(host)) && !isPublicAddress(host)) return "This address is not allowed";
  return null;
}
export function validatePort(raw: string): string | null {
  const t = raw.trim();
  return /^\d+$/.test(t) && (SMTP_PORT_OPTIONS as readonly number[]).includes(Number(t)) ? null : "Port must be 25, 465, 587 or 2525";
}
export function validateUser(v: string): string | null {
  const u = v.trim();
  if (u.length < 1 || u.length > 255) return "Username must be 1 to 255 characters";
  return SMTP_CONTROL_RE.test(u) ? "Username contains invalid characters" : null;
}
export function validateSmtpPassword(v: string): string | null {
  if (v.length < 1 || v.length > 512) return "Password must be 1 to 512 characters";
  return SMTP_CONTROL_RE.test(v) ? "Password contains invalid characters" : null;
}
export function validateApiKey(v: string): string | null {
  if (v.length < 8 || v.length > 512) return "API key must be 8 to 512 characters";
  return /^[\x21-\x7e]+$/.test(v) ? null : "API key must use only letters, numbers and symbols, without spaces";
}
export function validateMailgunDomain(v: string): string | null {
  return MAILGUN_HOST_RE.test(v.trim().toLowerCase()) ? null : "Sending domain must be a valid hostname";
}
export function validateFromAddress(v: string): string | null {
  return isPlainEmail(v.trim()) ? null : "From address must be a single email address";
}
export function validateReplyTo(v: string): string | null {
  const t = v.trim();
  return t === "" || isPlainEmail(t) ? null : "Reply-to must be a single email address";
}
export function validateFromName(v: string): string | null {
  const t = v.normalize("NFKC").trim();
  if (t === "") return null;
  const len = [...t].length;
  return len < 2 || len > 60 || BAD_NAME_RE.test(t) ? "From name must be 2 to 60 characters, without < > or hidden characters" : null;
}

export function validateEmailForm(v: EmailFormValues, stored: EmailSettings | null): FormErrors {
  const errs: FormErrors = {};
  const set = (k: FieldKey, m: string | null) => { if (m) errs[k] = m; };
  const fields = providerFields(v.choice);
  if (fields.includes("sesRegion") && smtpPresetFor("ses", v.sesRegion) === null) errs.sesRegion = "Enter an AWS region such as us-east-1";
  if (fields.includes("host")) set("host", validateHost(v.host));
  if (fields.includes("port")) set("port", validatePort(v.port));
  if (fields.includes("user")) set("user", validateUser(v.user));
  if (v.security === "plain" && fields.includes("security") && !v.allowPlain) errs.allowPlain = "Confirm that you want an unencrypted connection";
  if (fields.includes("domain")) set("domain", validateMailgunDomain(v.domain));
  if (fields.includes("secret")) {
    const smtp = providerOf(v.choice) === "smtp";
    if (v.secret === "") {
      const rule = secretRule(v, stored);
      if (rule === "reenter") errs.secret = PASSWORD_REENTER;
      else if (rule === "required") errs.secret = smtp ? "Password is required" : "API key is required";
    } else {
      set("secret", smtp ? validateSmtpPassword(v.secret) : validateApiKey(v.secret));
    }
  }
  set("fromAddress", validateFromAddress(v.fromAddress));
  set("fromName", validateFromName(v.fromName));
  set("replyTo", validateReplyTo(v.replyTo));
  return errs;
}

/** The PUT body. A blank secret is left out so the API keeps the stored one. */
export function toSaveBody(v: EmailFormValues): Record<string, unknown> {
  const provider = providerOf(v.choice);
  let config: Record<string, unknown>;
  if (provider === "smtp") {
    config = {
      host: normHost(v.host), port: Number(v.port.trim()), security: v.security, user: v.user.trim(),
      ...(v.security === "plain" ? { allowPlain: v.allowPlain } : {}),
      ...(v.secret !== "" ? { pass: v.secret } : {}),
    };
  } else {
    config = {
      ...(v.secret !== "" ? { apiKey: v.secret } : {}),
      ...(provider === "mailgun" ? { domain: v.domain.trim().toLowerCase(), region: v.region } : {}),
      ...(provider === "sendgrid" || provider === "sparkpost" ? { region: v.region } : {}),
    };
  }
  return {
    provider, config, fromAddress: v.fromAddress.trim(),
    fromName: v.fromName.normalize("NFKC").trim() || null, replyTo: v.replyTo.trim() || null,
  };
}

/** Unsaved changes: any non-secret field differs from the stored settings, or a secret was typed. */
export function hasUnsavedChanges(v: EmailFormValues, stored: EmailSettings | null): boolean {
  if (!stored) return true;
  if (v.secret !== "") return true;
  const base = formFromSettings(stored);
  const keys: (keyof EmailFormValues)[] = ["choice", "fromAddress", "fromName", "replyTo"];
  const smtp = providerOf(v.choice) === "smtp";
  keys.push(...(smtp ? (["port", "security", "user"] as const) : (["domain", "region"] as const)));
  if (keys.some((k) => v[k] !== base[k])) return true;
  if (smtp) {
    if (normHost(v.host) !== normHost(base.host)) return true;
    if ((v.security === "plain" && v.allowPlain) !== (base.security === "plain" && base.allowPlain)) return true;
  }
  return false;
}

/**
 * Background data arrived: new form values when the form has no unsaved changes against the previous data,
 * otherwise null (the person's edits are kept).
 */
export function reseedValues(current: EmailFormValues, prev: EmailSettings | null, next: EmailSettings | null): EmailFormValues | null {
  // With nothing saved yet, "no edits" means the form still equals the empty form.
  const dirty = prev ? hasUnsavedChanges(current, prev) : JSON.stringify(current) !== JSON.stringify(EMPTY_VALUES);
  return dirty ? null : formFromSettings(next);
}

// ── API calls through the same-origin /api/v1 proxy ──
export class EmailApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
    this.name = "EmailApiError";
  }
}

async function readError(res: Response): Promise<EmailApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; field?: string } } | null;
  return new EmailApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `Request failed (${res.status})`, body?.error?.field);
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export async function fetchEmailSettings(): Promise<EmailSettings | null> {
  const res = await fetch("/api/v1/organizations/email-settings", { cache: "no-store" });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { data: EmailSettings | null }).data;
}
export async function saveEmailSettings(v: EmailFormValues): Promise<EmailSettings> {
  const res = await fetch("/api/v1/organizations/email-settings", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(toSaveBody(v)) });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { data: EmailSettings }).data;
}

export type TestOutcome = { ok: true } | { ok: false; status: EmailStatus; reason: string; retryable: boolean };

/** POST /test takes exactly `{}`: an empty JSON body is refused by the server. */
export async function testEmailSettings(): Promise<TestOutcome> {
  const res = await fetch("/api/v1/organizations/email-settings/test", { method: "POST", headers: JSON_HEADERS, body: "{}" });
  if (!res.ok) throw await readError(res);
  const d = ((await res.json()) as { data: { status: EmailStatus; ok?: boolean; reason?: string; retryable?: boolean } }).data;
  if (d.ok === false) {
    return { ok: false, status: d.status === "failing" ? "failing" : "unverified", reason: typeof d.reason === "string" ? d.reason : "", retryable: d.retryable === true };
  }
  return { ok: true };
}
export async function removeEmailSettings(): Promise<void> {
  const res = await fetch("/api/v1/organizations/email-settings", { method: "DELETE" });
  if (!res.ok) throw await readError(res);
}

// ── Error text ──
export interface MappedError { field?: FieldKey; message: string }

const API_FIELD_MAP: Record<string, FieldKey> = {
  host: "host", port: "port", security: "security", allowPlain: "allowPlain", user: "user", pass: "secret", apiKey: "secret",
  domain: "domain", region: "region", fromAddress: "fromAddress", fromName: "fromName", replyTo: "replyTo",
};

export function mapEmailError(err: unknown): MappedError {
  if (!(err instanceof EmailApiError)) return { message: GENERIC_ERROR };
  if (err.status === 503 || err.code === "EMAIL_PROVIDER_UNAVAILABLE") return { message: UNAVAILABLE_MESSAGE };
  if (err.code === "VALIDATION_FAILED") {
    const field = err.field !== undefined && Object.hasOwn(API_FIELD_MAP, err.field) ? API_FIELD_MAP[err.field] : undefined;
    return { ...(field ? { field } : {}), message: err.message || "Please check the details and try again." };
  }
  if (err.status === 403) return { message: "You do not have permission to change the email settings." };
  if (err.status === 429) return { message: "Too many requests. Please wait a moment and try again." };
  return { message: GENERIC_ERROR };
}

/** Errors of the test call (the HTTP-level ones; a failed send comes back as a normal outcome). */
export function mapTestError(err: unknown): string {
  if (!(err instanceof EmailApiError)) return GENERIC_ERROR;
  if (err.code === "RATE_LIMITED") return TEST_LIMIT_MESSAGE;
  if (err.status === 429) return "Too many requests, try again in a minute";
  if (err.code === "NOT_CONFIGURED" || err.status === 404) return "Save your email settings before sending a test email.";
  if (err.code === "NO_RECIPIENT" || err.status === 409) return NO_RECIPIENT_MESSAGE;
  if (err.status === 503 || err.code === "EMAIL_PROVIDER_UNAVAILABLE") return UNAVAILABLE_MESSAGE;
  if (err.status === 403) return "You do not have permission to send a test email.";
  return GENERIC_ERROR;
}

/** A 404 NOT_CONFIGURED on the test means the cached settings are stale (removed elsewhere): refetch them. */
export function shouldRefreshAfterTestError(err: unknown): boolean {
  return err instanceof EmailApiError && err.code === "NOT_CONFIGURED";
}

/**
 * Readable text for a send failure reason. The reasons are the fixed strings the API adapters produce (they carry
 * no provider text and no credentials). Anything unrecognised gets a generic line; the raw reason is never shown.
 */
const REASON_RULES: readonly (readonly [RegExp, string])[] = [
  [/authentication failed/i, "Your provider refused the credentials. Check the username and password or the API key."],
  [/certificate not trusted/i, "The server's security certificate is not trusted. Check the host name, or ask your provider for a server with a valid certificate."],
  [/host not allowed/i, "That server address is not allowed. Use the public host name your provider gave you."],
  [/connection failed/i, "We could not connect to the server. Check the host, the port and the security setting."],
  [/rate limited/i, "Your provider is limiting how fast you can send. Try again later."],
  [/temporary failure/i, "The server reported a temporary problem. Try again in a few minutes."],
  [/rejected by (provider|server)/i, "Your provider rejected the email. Check that the From address is verified with your provider."],
  [/provider unavailable/i, "Your provider is not available right now. Try again later."],
  [/relay unavailable|relay rejected request|relay not authorised/i, "Our email relay is not available right now. Try again later."],
  [/invalid email address/i, "An email address in your settings is not valid."],
  [/invalid configuration/i, "The connection details are not valid. Check them and save again."],
  [/timeout|timed out|network error/i, "The connection timed out. Try again later."],
  [/unexpected (redirect|provider response)|could not read the provider response/i, "Your provider answered in an unexpected way. Check the settings and the region."],
  [/stored credentials cannot be read/i, "Your saved credentials cannot be read. Enter them again and save."],
  [/settings changed during the test/i, "Your settings changed during the test. Save and send the test again."],
  [/send failed|could not send the test email/i, "The test email could not be sent. Check your settings and try again."],
];

export const UNKNOWN_REASON_TEXT = "The email could not be sent. Check your settings and try again.";

export function describeSendReason(reason: string | null | undefined): string {
  if (typeof reason === "string") for (const [re, text] of REASON_RULES) if (re.test(reason)) return text;
  return UNKNOWN_REASON_TEXT;
}

// ── Status banner ──
export type BannerState = "none" | "unverified" | "verified" | "failing";
export interface BannerInfo { state: BannerState; title: string; detail: string | null }

export function bannerInfo(s: EmailSettings | null): BannerInfo {
  if (!s) return { state: "none", title: "Not connected: emails are sent from our address", detail: null };
  if (s.status === "verified") {
    return {
      state: "verified",
      title: `Connected: your organization's emails are sent from ${s.fromAddress}`,
      detail: "Once white-label is approved for your organization, your clients' sign-in codes and billing emails also go through this connection.",
    };
  }
  if (s.status === "failing") {
    return {
      state: "failing",
      title: "Not working: emails are sent from our address until you send a test email that succeeds",
      detail: s.lastError ? describeSendReason(s.lastError) : null,
    };
  }
  return {
    state: "unverified",
    title: "Saved. Send a test email to turn it on",
    detail: s.lastError ? `The last test failed. ${describeSendReason(s.lastError)}` : "Only a connection that passed a test is used.",
  };
}

/** The cached settings after a test: success verifies; a failure records the reason and the status the API reported. */
export function applyTestOutcome(s: EmailSettings, o: TestOutcome, now: string): EmailSettings {
  return o.ok
    ? { ...s, status: "verified", lastError: null, consecutiveFailures: 0, lastTestedAt: now }
    : { ...s, status: o.status, lastError: o.reason || "send failed", lastTestedAt: now };
}

// ── Busy lock and test availability ──
/** True while a save, test or remove runs, so every control stays disabled (no out-of-order responses). */
export function isEmailBusy(p: { saving: boolean; testing: boolean; removeState: ConfirmState }): boolean {
  return p.saving || p.testing || p.removeState === "running";
}

/** Why "Send test email to me" is unavailable, or null when it can be used. */
export function testDisabledReason(p: { saved: boolean; dirty: boolean; busy: boolean }): string | null {
  if (!p.saved) return "Save your settings first.";
  if (p.dirty) return "Save your changes first, then send the test.";
  return p.busy ? "Please wait." : null;
}

/** Drops the errors of the fields being edited; the other fields keep theirs. */
export function clearFieldErrors(errors: FormErrors, keys: FieldKey[]): FormErrors {
  const next = { ...errors };
  for (const k of keys) delete next[k];
  return next;
}
