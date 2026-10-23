// SSRF guard for customer-supplied SMTP hosts. The server connects to whatever host a client
// organization enters, so the host must resolve ONLY to public addresses, and the caller must
// connect to the exact address returned here (never re-resolve the name) to defeat DNS rebinding.
import { promises as dns } from "node:dns";
import { isIPv6 } from "node:net";

export type SafeHostResult =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; reason: "invalid_host" | "unsafe_address" | "unresolvable" };

type LookupResult = { address: string; family: number };
export interface SafeHostDeps {
  lookup?: (host: string, opts: { all: true; verbatim: true }) => Promise<LookupResult[]>;
}

const defaultLookup: NonNullable<SafeHostDeps["lookup"]> = (host, opts) => dns.lookup(host, opts);

const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Strict dotted-quad only: no leading zeros (octal ambiguity), each octet 0-255. */
function parseIPv4(s: string): [number, number, number, number] | null {
  const m = DOTTED_QUAD.exec(s);
  if (!m) return null;
  const out: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const part = m[i] as string;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

/** Unsafe IPv4 ranges (a.b.c.d). */
function isPublicIPv4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0) return false; // 0.0.0.0/8 unspecified / "this network"
  if (a === 10) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return false; // documentation TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // deprecated 6to4 relay anycast
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return false; // documentation TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // documentation TEST-NET-3
  if (a >= 224) return false; // multicast 224/4, reserved 240/4, broadcast
  return true;
}

/** Expands an IPv6 literal into eight 16-bit groups, or null when malformed. */
function parseIPv6(s: string): number[] | null {
  if (s.includes("%") || !isIPv6(s)) return null;
  let str = s.toLowerCase();
  const lastColon = str.lastIndexOf(":");
  const tail = str.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    str = `${str.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? (halves[0] as string).split(":") : [];
  const rest = halves.length === 2 && halves[1] ? (halves[1] as string).split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function v4FromGroups(hi: number, lo: number): [number, number, number, number] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isPublicIPv6(g: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const zero5 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::, ::1, ::a.b.c.d (IPv4-compatible): judged by the embedded IPv4 (::/::1 fall in 0/8)
  if (zero5 && g5 === 0) return isPublicIPv4(v4FromGroups(g6, g7));
  // ::ffff:a.b.c.d (IPv4-mapped): judged by the embedded IPv4
  if (zero5 && g5 === 0xffff) return isPublicIPv4(v4FromGroups(g6, g7));
  // ::ffff:0:a.b.c.d (SIIT translated) is not publicly routable
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return false;
  // 64:ff9b::/96 (NAT64): judged by the embedded IPv4
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicIPv4(v4FromGroups(g6, g7));
  // 6to4 2002::/16: judged by the embedded IPv4
  if (g0 === 0x2002) return isPublicIPv4(v4FromGroups(g1, g2));
  // Everything else must be global unicast 2000::/3 ...
  if ((g0 & 0xe000) !== 0x2000) return false; // covers ::/8, fc00::/7, fe80::/10, fec0::/10, ff00::/8
  // ... minus Teredo 2001::/32, documentation 2001:db8::/32 and 3fff::/20, 64:ff9b:1::/48 is outside 2000::/3
  if (g0 === 0x2001 && g1 === 0) return false;
  if (g0 === 0x2001 && g1 === 0xdb8) return false;
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return false;
  return true;
}

function isPublicAddress(addr: string): boolean {
  const v4 = parseIPv4(addr);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(addr);
  return v6 ? isPublicIPv6(v6) : false;
}

function familyOf(addr: string): 4 | 6 {
  return addr.includes(":") ? 6 : 4;
}

export async function resolveSafeSmtpHost(host: string, deps: SafeHostDeps = {}): Promise<SafeHostResult> {
  if (typeof host !== "string" || host.length < 1 || host.length > 253) return { ok: false, reason: "invalid_host" };
  // IP literals: dotted quad or IPv6 only; every other all-numeric / hex form is refused.
  if (parseIPv4(host)) return isPublicAddress(host) ? { ok: true, address: host, family: 4 } : { ok: false, reason: "unsafe_address" };
  if (host.includes(":")) {
    if (!parseIPv6(host)) return { ok: false, reason: "invalid_host" };
    return isPublicAddress(host) ? { ok: true, address: host, family: 6 } : { ok: false, reason: "unsafe_address" };
  }
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, reason: "invalid_host" };
  // The last label (TLD) is never numeric or hex-prefixed: blocks 2130706433, 0x7f.1, 127.1, 127.0.0.01 ...
  const tld = labels[labels.length - 1] as string;
  if (/^\d+$/.test(tld) || /^0x/i.test(tld)) return { ok: false, reason: "invalid_host" };

  let results: LookupResult[];
  try {
    results = await (deps.lookup ?? defaultLookup)(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
  if (!Array.isArray(results) || results.length === 0) return { ok: false, reason: "unresolvable" };
  for (const r of results) {
    if (!r || typeof r.address !== "string" || !isPublicAddress(r.address)) return { ok: false, reason: "unsafe_address" };
  }
  const addrs = results.map((r) => r.address);
  const first = addrs.find((a) => familyOf(a) === 4) ?? (addrs[0] as string);
  return { ok: true, address: first, family: familyOf(first) };
}
