// Pure IP literal parsing and public/unsafe classification (no DNS, no node: imports), shared by
// the web relay (SSRF guard before connecting to a customer SMTP host) and the API (refuse unsafe
// literals when the settings are saved).

export type Ipv4 = [number, number, number, number];

const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

/** Strict dotted quad only: no leading zeros (octal ambiguity), each octet 0-255. */
export function parseDottedQuadIpv4(s: string): Ipv4 | null {
  const m = typeof s === "string" ? DOTTED_QUAD.exec(s) : null;
  if (!m) return null;
  const out: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const part = m[i] as string;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out as Ipv4;
}

/** Expands an IPv6 literal into eight 16-bit groups; null when malformed. Zone ids (%) are refused. */
export function parseIpv6(s: string): number[] | null {
  if (typeof s !== "string" || s.length < 2 || s.length > 45 || !s.includes(":") || s.includes("%")) return null;
  let str = s;
  const lastColon = str.lastIndexOf(":");
  const tail = str.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseDottedQuadIpv4(tail);
    if (!v4) return null;
    str = `${str.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? (halves[0] as string).split(":") : [];
  const rest = halves.length === 2 && halves[1] ? (halves[1] as string).split(":") : [];
  if (![...head, ...rest].every((g) => HEX_GROUP.test(g))) return null;
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 1 && halves.length === 2) return null; // "::" must stand for at least one group
  return [...head, ...Array<string>(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
}

/** True for a strict dotted-quad IPv4 or a valid IPv6 literal. */
export function isIpLiteral(s: string): boolean {
  return parseDottedQuadIpv4(s) !== null || parseIpv6(s) !== null;
}

/** IPv4 ranges that are not public (a.b.c.d). */
function isPublicIpv4([a, b, c]: Ipv4): boolean {
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

function v4FromGroups(hi: number, lo: number): Ipv4 {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isPublicIpv6(g: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const zero5 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::, ::1, ::a.b.c.d (IPv4-compatible): judged by the embedded IPv4 (:: and ::1 fall in 0/8)
  if (zero5 && g5 === 0) return isPublicIpv4(v4FromGroups(g6, g7));
  // ::ffff:a.b.c.d (IPv4-mapped): judged by the embedded IPv4
  if (zero5 && g5 === 0xffff) return isPublicIpv4(v4FromGroups(g6, g7));
  // ::ffff:0:a.b.c.d (SIIT translated) is not publicly routable
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return false;
  // 64:ff9b::/96 (NAT64): judged by the embedded IPv4
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicIpv4(v4FromGroups(g6, g7));
  // 6to4 2002::/16: judged by the embedded IPv4
  if (g0 === 0x2002) return isPublicIpv4(v4FromGroups(g1, g2));
  // Everything else must be global unicast 2000::/3 (covers ::/8, fc00::/7, fe80::/10, fec0::/10, ff00::/8, 64:ff9b:1::/48) ...
  if ((g0 & 0xe000) !== 0x2000) return false;
  // ... minus these special-purpose blocks inside it:
  if (g0 === 0x2001 && g1 === 0) return false; // Teredo 2001::/32
  if (g0 === 0x2001 && g1 === 2 && g2 === 0) return false; // benchmarking 2001:2::/48
  if (g0 === 0x2001 && g1 === 0xdb8) return false; // documentation 2001:db8::/32
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x10) return false; // ORCHID 2001:10::/28
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x20) return false; // ORCHIDv2 2001:20::/28
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return false; // documentation 3fff::/20
  return true;
}

/** True only for a syntactically valid IP literal that is a public address. Anything else is false. */
export function isPublicAddress(ip: string): boolean {
  const v4 = parseDottedQuadIpv4(ip);
  if (v4) return isPublicIpv4(v4);
  const v6 = parseIpv6(ip);
  return v6 ? isPublicIpv6(v6) : false;
}

/**
 * Normalises an IP literal: an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) becomes
 * the embedded IPv4 with family 4; other addresses are returned unchanged. Null when not an IP literal.
 */
export function normalizeIpv4Mapped(ip: string): { address: string; family: 4 | 6 } | null {
  if (parseDottedQuadIpv4(ip)) return { address: ip, family: 4 };
  const g = parseIpv6(ip);
  if (!g) return null;
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    const [a, b, c, d] = v4FromGroups(g[6] as number, g[7] as number);
    return { address: `${a}.${b}.${c}.${d}`, family: 4 };
  }
  return { address: ip, family: 6 };
}
