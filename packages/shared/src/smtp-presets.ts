// SMTP presets shared by the API (validation helpers) and the web settings screen. Data only.
export const SMTP_PRESET_IDS = ["gmail", "microsoft365", "ses", "godaddy", "zoho"] as const;
export type SmtpPresetId = (typeof SMTP_PRESET_IDS)[number];

export interface SmtpPresetData {
  label: string;
  /** A short sentence on where to find the credentials. */
  help: string;
  /** The SES host holds a {region} placeholder; resolve with smtpPresetFor(). */
  host: string;
  port: 25 | 465 | 587 | 2525;
  security: "ssl" | "starttls" | "plain";
  /** True when the host needs an AWS region. */
  needsRegion?: boolean;
}

export const SMTP_PRESETS: Record<SmtpPresetId, SmtpPresetData> = {
  gmail: {
    label: "Gmail / Google Workspace (app password)",
    help: "Use your full email address as the username and an app password (Google Account, Security, App passwords), not your normal password.",
    host: "smtp.gmail.com", port: 587, security: "starttls",
  },
  microsoft365: {
    label: "Microsoft 365",
    help: "Use your full email address as the username. SMTP AUTH must be enabled for this mailbox by your Microsoft 365 admin.",
    host: "smtp.office365.com", port: 587, security: "starttls",
  },
  ses: {
    label: "Amazon SES",
    help: "Use the SMTP credentials created in the SES console (SMTP settings), not your IAM access keys. Pick the region of your SES account.",
    host: "email-smtp.{region}.amazonaws.com", port: 587, security: "starttls", needsRegion: true,
  },
  godaddy: {
    label: "GoDaddy",
    help: "Use your full email address and its password.",
    host: "smtpout.secureserver.net", port: 465, security: "ssl",
  },
  zoho: {
    label: "Zoho Mail",
    help: "Use your full email address and an application-specific password from your Zoho account security settings.",
    host: "smtp.zoho.com", port: 465, security: "ssl",
  },
};

const AWS_REGION_RE = /^[a-z]{2}(-[a-z]+){1,2}-\d{1,2}$/;

/** The host, port and security for a preset; SES needs a valid AWS region. Null for an unknown id or a bad region. */
export function smtpPresetFor(
  id: string,
  region?: string,
): { host: string; port: SmtpPresetData["port"]; security: SmtpPresetData["security"] } | null {
  if (typeof id !== "string" || !Object.hasOwn(SMTP_PRESETS, id)) return null;
  const p = SMTP_PRESETS[id as SmtpPresetId];
  let host = p.host;
  if (p.needsRegion) {
    if (typeof region !== "string" || !AWS_REGION_RE.test(region)) return null;
    host = host.replace("{region}", region);
  }
  return { host, port: p.port, security: p.security };
}
