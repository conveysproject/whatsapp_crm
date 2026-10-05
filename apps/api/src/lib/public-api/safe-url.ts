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

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return ipv4Private(mapped[1]!);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
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
