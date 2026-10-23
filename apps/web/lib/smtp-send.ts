// Sends ONE email through a client organization's own SMTP server. The server connects to a
// customer-supplied host, so: the host must resolve only to public addresses, the connection goes
// to the exact IP that was checked, the certificate is verified against the original hostname,
// ports are a fixed allow-list, and nothing from the SMTP server or the credentials is ever
// returned or logged.
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { buildFrom, isPlainEmail } from "./mail-from";
import { resolveSafeSmtpHost, type SafeHostDeps } from "./safe-host";

export const ALLOWED_SMTP_PORTS = [25, 465, 587, 2525] as const;
export const SMTP_SECURITY = ["ssl", "starttls", "plain"] as const;

export interface SmtpSettings {
  host: string;
  port: number;
  security: (typeof SMTP_SECURITY)[number];
  allowPlain?: boolean;
  user: string;
  pass: string;
  fromAddress: string;
}

export interface SmtpMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fromName?: string;
}

export type SmtpSendResult = { ok: true } | { ok: false; retryable: boolean; reason: string };

export interface SmtpSendDeps extends SafeHostDeps {
  createTransport?: typeof nodemailer.createTransport;
}

const EHLO_NAME = "mail.wbmsg.com";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000\r\n]/;

const fail = (retryable: boolean, reason: string): SmtpSendResult => ({ ok: false, retryable, reason });
const INVALID = fail(false, "invalid configuration");

/** Shape and range checks that need no network. Returns false for anything off-spec. */
export function isValidSmtpSettings(s: unknown): s is SmtpSettings {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  if (typeof o["host"] !== "string") return false;
  if (typeof o["port"] !== "number" || !(ALLOWED_SMTP_PORTS as readonly number[]).includes(o["port"])) return false;
  if (typeof o["security"] !== "string" || !(SMTP_SECURITY as readonly string[]).includes(o["security"])) return false;
  if (o["allowPlain"] !== undefined && typeof o["allowPlain"] !== "boolean") return false;
  if (o["security"] === "plain" && o["allowPlain"] !== true) return false;
  const user = o["user"];
  if (typeof user !== "string" || user.length < 1 || user.length > 255 || CONTROL.test(user)) return false;
  const pass = o["pass"];
  if (typeof pass !== "string" || pass.length < 1 || pass.length > 512 || CONTROL.test(pass)) return false;
  return isPlainEmail(o["fromAddress"]);
}

const CERT_CODES = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
  "CERT_REVOKED",
  "HOSTNAME_MISMATCH",
]);
const CONNECTION_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET", "EDNS", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETLS"]);

function codesOf(err: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 3 && typeof cur === "object" && cur !== null; i++) {
    const c = (cur as { code?: unknown }).code;
    if (typeof c === "string") out.push(c);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

/** Maps a nodemailer error to a fixed reason. Never reads err.message or err.response. */
export function mapSmtpError(err: unknown): SmtpSendResult {
  const codes = codesOf(err);
  const rc = typeof err === "object" && err !== null ? (err as { responseCode?: unknown }).responseCode : undefined;
  const responseCode = typeof rc === "number" ? rc : undefined;
  if (codes.some((c) => CERT_CODES.has(c))) return fail(false, "certificate not trusted");
  if (codes.includes("EAUTH") || responseCode === 535) return fail(false, "authentication failed");
  if (codes.some((c) => CONNECTION_CODES.has(c))) return fail(true, "connection failed");
  if (responseCode !== undefined && responseCode >= 500) return fail(false, "rejected by server");
  if (codes.includes("EENVELOPE")) return fail(false, "rejected by server");
  if (responseCode !== undefined && responseCode >= 400) return fail(true, "temporary failure");
  return fail(true, "send failed");
}

export async function sendViaSmtp(smtp: SmtpSettings, message: SmtpMessage, deps: SmtpSendDeps = {}): Promise<SmtpSendResult> {
  if (!isValidSmtpSettings(smtp)) return INVALID;
  if (typeof message !== "object" || message === null) return INVALID;
  const { to, subject, html, replyTo, fromName } = message;
  if (!isPlainEmail(to) || typeof subject !== "string" || typeof html !== "string") return INVALID;
  if (replyTo !== undefined && replyTo !== "" && !isPlainEmail(replyTo)) return INVALID;

  const resolved = await resolveSafeSmtpHost(smtp.host, deps.lookup ? { lookup: deps.lookup } : {});
  if (!resolved.ok) {
    if (resolved.reason === "unresolvable") return fail(true, "connection failed");
    return fail(false, "host not allowed");
  }

  const hostIsLiteral = isIP(smtp.host) !== 0;
  const options = {
    // Connect to the exact address that was checked; the name is only used for certificate verification.
    host: resolved.address,
    port: smtp.port,
    secure: smtp.security === "ssl",
    ...(smtp.security === "starttls" ? { requireTLS: true } : {}),
    ...(smtp.security === "plain" ? { ignoreTLS: false } : {}),
    tls: {
      ...(hostIsLiteral ? {} : { servername: smtp.host }),
      rejectUnauthorized: true,
      minVersion: "TLSv1.2" as const,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: smtp.user, pass: smtp.pass },
    name: EHLO_NAME,
    logger: false,
    debug: false,
  };

  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    transport = (deps.createTransport ?? nodemailer.createTransport)(options);
    await transport.sendMail({
      from: buildFrom(fromName, smtp.fromAddress),
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    return { ok: true };
  } catch (err: unknown) {
    return mapSmtpError(err);
  } finally {
    try {
      transport?.close();
    } catch {
      // closing is best effort
    }
  }
}
