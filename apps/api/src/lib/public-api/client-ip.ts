import { isIP } from "node:net";

// Client address for the public API's pre-auth rate limit.
//
// Behind Railway's proxy request.ip is the proxy's address (100.64.0.x) for every caller, so keying on it makes the
// pre-auth guard one global bucket. Fastify's trustProxy would fix that, but it changes request.ip for the whole app
// (audit logs, the dashboard limiter), so the public API resolves the address itself.
//
// Trust rule: X-Forwarded-For is only read when the direct socket peer is a private / CGNAT / loopback address (our
// own proxy hop); a public peer is a direct connection and any forwarded header is attacker-controlled. Within the
// header the proxy APPENDS the address it saw, so entries added by the visitor sit on the LEFT: scan from the right,
// skip our own private hops, and take the first public entry. A visitor cannot pick their bucket by spoofing.

const MAX_HEADER_CHARS = 8192; // a hostile header cannot make us do unbounded work; only the right-hand tail matters

function mapV4(ip: string): string {
  return ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6);
}

function parseEntry(raw: string): string | null {
  let s = raw.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end < 0) return null;
    s = s.slice(1, end);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) {
    s = s.slice(0, s.lastIndexOf(":"));
  }
  if (!isIP(s)) return null;
  return mapV4(s.toLowerCase());
}

export function clientIp(
  peer: string,
  forwardedFor?: string | string[],
  realIp?: string | string[]
): string {
  const socket = mapV4(peer);
  if (!isIP(socket) || !isPrivate(socket)) return socket;

  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? "";
  const tail = header.length > MAX_HEADER_CHARS ? header.slice(-MAX_HEADER_CHARS) : header;
  let rightmost: string | null = null;
  const entries = tail.split(",");
  for (let i = entries.length - 1; i >= 0; i--) {
    const ip = parseEntry(entries[i]);
    if (!ip) continue;
    if (!isPrivate(ip)) return ip;
    rightmost ??= ip;
  }
  if (rightmost) return rightmost;

  const real = parseEntry(Array.isArray(realIp) ? realIp[realIp.length - 1] ?? "" : realIp ?? "");
  return real ?? socket;
}
