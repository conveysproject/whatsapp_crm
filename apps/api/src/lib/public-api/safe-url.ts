import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

/** Expand a valid IPv6 literal (any notation, incl. `::` and trailing dotted quad) to 16 bytes. */
function ipv6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const o = tail[2]!.split(".").map(Number);
    if (o.some((n) => n > 255)) return null;
    s = `${tail[1]}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const b = ipv6Bytes(ip);
    if (!b) return true; // unparseable: fail closed
    const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    const v4 = (at: number) => ipv4Private(`${b[at]}.${b[at + 1]}.${b[at + 2]}.${b[at + 3]}`);
    if (zero(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: and ::1
    if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4(12); // ::ffff:0:0/96 mapped
    if (zero(0, 12)) return v4(12); // ::/96 IPv4-compatible
    if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return v4(12); // ::ffff:0:0:0/96 SIIT
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return v4(12); // 64:ff9b::/96 NAT64
    if (b[0] === 0x20 && b[1] === 0x02) return v4(2); // 2002::/16 6to4
    if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local
    if (b[0] === 0xfe && (b[1]! & 0xc0) >= 0x80) return true; // fe80::/10 link-local + fec0::/10 site-local
    if (b[0] === 0xff) return true; // ff00::/8 multicast
    return false;
  }
  return true; // not an IP: treat as unsafe
}

/**
 * HTTPS only, no credentials, and every resolved address must be public.
 * Residual risk: DNS can change between this check and the request (rebinding);
 * callers must validate immediately before fetching and never follow redirects.
 */
export async function assertSafeCallbackUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError("invalid URL"); }
  if (url.protocol !== "https:") throw new UnsafeUrlError("URL must be https");
  if (url.username || url.password) throw new UnsafeUrlError("URL must not contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("URL resolves to a private address");
    return url;
  }
  let addrs: Array<{ address: string }>;
  try { addrs = await lookup(host, { all: true }); } catch { throw new UnsafeUrlError("host does not resolve"); }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("URL resolves to a private address");
  }
  return url;
}
