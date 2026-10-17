// Pure formatters for Settings → Security.
export type SessionClient = "web" | "mobile" | "admin";

export interface DeviceSession {
  id: string;
  client: string;
  deviceLabel: string | null;
  ip: string | null;
  lastUsedAt: string | null;
  current: boolean;
}

const CLIENT_LABELS: Record<string, string> = { web: "Web", mobile: "Mobile", admin: "Admin" };

export function clientLabel(client: string): string {
  return CLIENT_LABELS[client] ?? "Other";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function relativeTime(now: Date, iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Unknown";
  const secs = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return plural(mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days <= 30) return plural(days, "day");
  return `${then.getUTCDate()} ${MONTHS[then.getUTCMonth()]} ${then.getUTCFullYear()}`;
}

export function summarizeUserAgent(ua: string | null | undefined): string | null {
  if (!ua || !ua.trim()) return null;
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

/** The device label may be a human name ("Pixel 8") or a raw user agent; show something readable either way. */
export function deviceTitle(s: { client: string; deviceLabel: string | null }): string {
  const label = s.deviceLabel?.trim();
  if (label) {
    if (/Mozilla\/|AppleWebKit|Gecko/.test(label)) return summarizeUserAgent(label) ?? `${clientLabel(s.client)} session`;
    return label;
  }
  return `${clientLabel(s.client)} session`;
}
