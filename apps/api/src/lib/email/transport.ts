// Outbound email transport for client organizations that send through their OWN
// provider account. Hosts are fixed constants in the adapters; the only
// user-controlled URL part is the Mailgun domain, which is validated here.
import { sendgridTransport } from "./providers/sendgrid.js";
import { mailgunTransport } from "./providers/mailgun.js";
import { postmarkTransport } from "./providers/postmark.js";
import { resendTransport } from "./providers/resend.js";
import { brevoTransport } from "./providers/brevo.js";
import { sparkpostTransport } from "./providers/sparkpost.js";

export interface OutboundEmail {
  from: { name: string | null; address: string };
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/** `reason` is a short sanitized string and never contains credentials or provider response text. */
export type SendResult = { ok: true } | { ok: false; retryable: boolean; reason: string };

export interface EmailTransport {
  send(m: OutboundEmail): Promise<SendResult>;
}

export const HTTP_PROVIDERS = ["sendgrid", "mailgun", "postmark", "resend", "brevo", "sparkpost"] as const;

export type ProviderConfig =
  | { provider: "sendgrid" | "resend" | "postmark" | "brevo" | "sparkpost"; apiKey: string; region?: "us" | "eu" }
  | { provider: "mailgun"; apiKey: string; domain: string; region: "us" | "eu" };

export type FetchLike = typeof fetch;

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidMailgunDomain(domain: string): boolean {
  return HOSTNAME_RE.test(domain);
}

export function buildHttpTransport(config: ProviderConfig, fetchImpl: FetchLike = fetch): EmailTransport {
  switch (config.provider) {
    case "sendgrid":
      return sendgridTransport(config.apiKey, config.region ?? "us", fetchImpl);
    case "mailgun":
      if (!isValidMailgunDomain(config.domain)) throw new Error("invalid mailgun domain");
      return mailgunTransport(config.apiKey, config.domain, config.region, fetchImpl);
    case "postmark":
      return postmarkTransport(config.apiKey, fetchImpl);
    case "resend":
      return resendTransport(config.apiKey, fetchImpl);
    case "brevo":
      return brevoTransport(config.apiKey, fetchImpl);
    case "sparkpost":
      return sparkpostTransport(config.apiKey, config.region ?? "us", fetchImpl);
    default:
      throw new Error("unsupported email provider");
  }
}

type Validation = { ok: true; config: ProviderConfig } | { ok: false; field: string; message: string };

const fail = (field: string, message: string): Validation => ({ ok: false, field, message });

// Messages never include the submitted value, so a malformed key is not echoed.
export function validateProviderConfig(provider: string, raw: unknown): Validation {
  if (!(HTTP_PROVIDERS as readonly string[]).includes(provider)) return fail("provider", "Unknown email provider");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("config", "Configuration must be an object");
  const r = raw as Record<string, unknown>;

  const key = r["apiKey"];
  if (typeof key !== "string") return fail("apiKey", "API key is required");
  if (key.length < 8 || key.length > 512) return fail("apiKey", "API key must be 8 to 512 characters");
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(key)) return fail("apiKey", "API key must not contain spaces or control characters");

  const rr = r["region"];
  if (rr !== undefined && rr !== "us" && rr !== "eu") return fail("region", "Region must be us or eu");
  const regionRaw: "us" | "eu" | undefined = rr;

  if (provider === "mailgun") {
    const d = r["domain"];
    if (typeof d !== "string") return fail("domain", "Sending domain is required");
    const domain = d.toLowerCase();
    if (!isValidMailgunDomain(domain)) return fail("domain", "Sending domain must be a valid hostname");
    return { ok: true, config: { provider: "mailgun", apiKey: key, domain, region: regionRaw ?? "us" } };
  }

  const hasEu = provider === "sendgrid" || provider === "sparkpost";
  const config = {
    provider: provider as "sendgrid" | "resend" | "postmark" | "brevo" | "sparkpost",
    apiKey: key,
    ...(hasEu && regionRaw ? { region: regionRaw } : {}),
  };
  return { ok: true, config };
}

/** For logging and audit: the config with the API key masked. */
export function redactConfig<T extends ProviderConfig>(config: T): T {
  return { ...config, apiKey: "***" };
}
