// Client SMTP (Gmail / Google Workspace app password, Microsoft 365, Amazon SES, GoDaddy, Zoho ...).
// Railway blocks outbound SMTP, so this adapter does not speak SMTP: it POSTs to the web relay
// (Vercel), which connects to the client's server through an SSRF-safe, pinned connection.
// The password is only ever in the relay request body; it never appears in a reason, error or log.
import {
  SMTP_PRESETS, isPublicAddress, normalizeIpv4Mapped, parseDottedQuadIpv4, parseIpv6, smtpPresetFor,
  type SmtpPresetId,
} from "@WBMSG/shared";
import { PLAIN_EMAIL_RE } from "../../brand.js";
import type { EmailTransport, FetchLike, OutboundEmail, SendResult } from "../transport.js";

export const SMTP_PORTS = [25, 465, 587, 2525] as const;
export const SMTP_SECURITY = ["ssl", "starttls", "plain"] as const;

export interface SmtpConfig {
  host: string;
  port: (typeof SMTP_PORTS)[number];
  security: (typeof SMTP_SECURITY)[number];
  /** Must be true for security "plain". */
  allowPlain?: boolean;
  user: string;
  pass: string;
  fromAddress: string;
}

export type SmtpValidation = { ok: true; config: SmtpConfig } | { ok: false; field: string; message: string };

const fail = (field: string, message: string): SmtpValidation => ({ ok: false, field, message });

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000\r\n]/;

/** A hostname (2+ labels, non-numeric TLD) or an IP literal. IPv4 literals must be strict dotted quads. */
export function isValidSmtpHost(host: string): boolean {
  if (host.length < 1 || host.length > 253) return false;
  if (host.includes(":")) return parseIpv6(host) !== null;
  if (parseDottedQuadIpv4(host)) return true;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return false;
  const tld = labels[labels.length - 1] as string;
  return !/^\d+$/.test(tld) && !tld.startsWith("0x");
}

// Messages never include the submitted value.
export function validateSmtpConfig(raw: unknown): SmtpValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return fail("config", "Configuration must be an object");
  const r = raw as Record<string, unknown>;

  const hostRaw = r["host"];
  if (typeof hostRaw !== "string") return fail("host", "SMTP host is required");
  let host = hostRaw.toLowerCase();
  if (!isValidSmtpHost(host)) return fail("host", "SMTP host must be a hostname or IP address, without a scheme, port or path");
  // IP literals must be public (the relay re-checks hostnames at send time); mapped IPv4 is stored as IPv4.
  if (host.includes(":") || parseDottedQuadIpv4(host)) {
    if (!isPublicAddress(host)) return fail("host", "This address is not allowed");
    host = normalizeIpv4Mapped(host)?.address ?? host;
  }

  const port = r["port"];
  if (typeof port !== "number" || !(SMTP_PORTS as readonly number[]).includes(port)) return fail("port", "Port must be 25, 465, 587 or 2525");

  const security = r["security"];
  if (typeof security !== "string" || !(SMTP_SECURITY as readonly string[]).includes(security)) {
    return fail("security", "Security must be ssl, starttls or plain");
  }

  const allowPlain = r["allowPlain"];
  if (allowPlain !== undefined && typeof allowPlain !== "boolean") return fail("allowPlain", "allowPlain must be true or false");
  if (security === "plain" && allowPlain !== true) return fail("allowPlain", "Unencrypted sending needs allowPlain to be confirmed");
  if (security !== "plain" && allowPlain !== undefined) return fail("allowPlain", "allowPlain applies only to unencrypted sending");

  const user = r["user"];
  if (typeof user !== "string" || user.length < 1 || user.length > 255) return fail("user", "Username must be 1 to 255 characters");
  if (CONTROL_RE.test(user)) return fail("user", "Username contains invalid characters");

  const pass = r["pass"];
  if (typeof pass !== "string" || pass.length < 1 || pass.length > 512) return fail("pass", "Password must be 1 to 512 characters");
  if (CONTROL_RE.test(pass)) return fail("pass", "Password contains invalid characters");

  const from = r["fromAddress"];
  if (typeof from !== "string" || !PLAIN_EMAIL_RE.test(from)) return fail("fromAddress", "From address must be a single email address");

  return {
    ok: true,
    config: {
      host,
      port: port as SmtpConfig["port"],
      security: security as SmtpConfig["security"],
      ...(security === "plain" ? { allowPlain: true } : {}),
      user,
      pass,
      fromAddress: from,
    },
  };
}

// ---- Presets (used by the settings UI) ----

export type PresetId = SmtpPresetId;
export type SmtpPreset = Pick<SmtpConfig, "host" | "port" | "security">;

/** The preset data lives in @WBMSG/shared so the web settings screen uses the same values. */
export const PRESETS = SMTP_PRESETS;

/** The host/port/security for a preset; SES needs a valid AWS region. Returns null for a bad id or region. */
export function presetFor(id: PresetId, region?: string): SmtpPreset | null {
  return smtpPresetFor(id, region);
}

// ---- Transport (via the web relay) ----

/**
 * Must stay strictly above the web relay's `maxDuration` (30 s) so the API never gives up, and retries,
 * while the relay may still deliver. A test reads the relay source to enforce this.
 */
export const SMTP_RELAY_TIMEOUT_MS = 35_000;

/** The only reasons the relay may report; anything else becomes "send failed". */
const RELAY_REASONS = new Set([
  "authentication failed",
  "connection failed",
  "certificate not trusted",
  "rejected by server",
  "temporary failure",
  "host not allowed",
  "invalid configuration",
  "send failed",
]);

const out = (retryable: boolean, reason: string): SendResult => ({ ok: false, retryable, reason });

export function buildSmtpTransport(config: SmtpConfig, deps: { fetchImpl?: FetchLike } = {}): EmailTransport {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return {
    async send(m: OutboundEmail): Promise<SendResult> {
      if (typeof m.to !== "string" || !PLAIN_EMAIL_RE.test(m.to) || (m.replyTo !== undefined && !PLAIN_EMAIL_RE.test(m.replyTo))) {
        return out(false, "invalid email address");
      }
      const webUrl = process.env["WEB_URL"];
      const secret = process.env["INTERNAL_EMAIL_SECRET"];
      if (!webUrl || !secret) return out(false, "relay unavailable");

      const body = {
        to: m.to,
        subject: m.subject,
        html: m.html,
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        ...(m.from.name ? { fromName: m.from.name } : {}),
        smtp: {
          host: config.host,
          port: config.port,
          security: config.security,
          ...(config.allowPlain ? { allowPlain: true } : {}),
          user: config.user,
          pass: config.pass,
          fromAddress: config.fromAddress,
        },
      };

      let res: Response;
      try {
        res = await fetchImpl(`${webUrl.replace(/\/$/, "")}/api/internal/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
          body: JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(SMTP_RELAY_TIMEOUT_MS),
        });
      } catch {
        // Never use the error text: it could carry request details.
        return out(true, "relay unavailable");
      }

      if (res.status >= 200 && res.status < 300) return { ok: true };

      if (res.status === 502) {
        try {
          const j = (await res.json()) as { retryable?: unknown; reason?: unknown };
          const reason = typeof j.reason === "string" && RELAY_REASONS.has(j.reason) ? j.reason : "send failed";
          return out(typeof j.retryable === "boolean" ? j.retryable : true, reason);
        } catch {
          return out(true, "relay unavailable");
        }
      }
      try {
        await res.body?.cancel();
      } catch {
        // best effort
      }
      if (res.status === 401 || res.status === 403) return out(false, "relay not authorised");
      if (res.status >= 500 || res.status === 408 || res.status === 429) return out(true, "relay unavailable");
      return out(false, "relay rejected request");
    },
  };
}
