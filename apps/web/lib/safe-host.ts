// SSRF guard for customer-supplied SMTP hosts. The server connects to whatever host a client
// organization enters, so the host must resolve ONLY to public addresses, and the caller must
// connect to the exact address returned here (never re-resolve the name) to defeat DNS rebinding.
// The address classification (the unsafe-range table) lives in @WBMSG/shared so the API applies the
// same rules when settings are saved.
import { promises as dns } from "node:dns";
import { isPublicAddress, normalizeIpv4Mapped, parseDottedQuadIpv4, parseIpv6 } from "@WBMSG/shared";

export type SafeHostResult =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; reason: "invalid_host" | "unsafe_address" | "unresolvable" };

type LookupResult = { address: string; family: number };
export interface SafeHostDeps {
  lookup?: (host: string, opts: { all: true; verbatim: true }) => Promise<LookupResult[]>;
}

/** A DNS lookup that has not answered by now is treated as unresolvable. */
export const LOOKUP_TIMEOUT_MS = 5000;

const defaultLookup: NonNullable<SafeHostDeps["lookup"]> = (host, opts) => dns.lookup(host, opts);

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("lookup timeout")), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

function literalResult(address: string): SafeHostResult {
  const n = isPublicAddress(address) ? normalizeIpv4Mapped(address) : null;
  return n ? { ok: true, address: n.address, family: n.family } : { ok: false, reason: "unsafe_address" };
}

export async function resolveSafeSmtpHost(host: string, deps: SafeHostDeps = {}): Promise<SafeHostResult> {
  if (typeof host !== "string" || host.length < 1 || host.length > 253) return { ok: false, reason: "invalid_host" };
  // IP literals: dotted quad or IPv6 only; every other all-numeric / hex form is refused.
  if (parseDottedQuadIpv4(host)) return literalResult(host);
  if (host.includes(":")) return parseIpv6(host) ? literalResult(host) : { ok: false, reason: "invalid_host" };
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, reason: "invalid_host" };
  // The last label (TLD) is never numeric or hex-prefixed: blocks 2130706433, 0x7f.1, 127.1, 127.0.0.01 ...
  const tld = labels[labels.length - 1] as string;
  if (/^\d+$/.test(tld) || /^0x/i.test(tld)) return { ok: false, reason: "invalid_host" };

  let results: LookupResult[];
  try {
    results = await withDeadline((deps.lookup ?? defaultLookup)(host, { all: true, verbatim: true }), LOOKUP_TIMEOUT_MS);
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
  if (!Array.isArray(results) || results.length === 0) return { ok: false, reason: "unresolvable" };
  const normalized: { address: string; family: 4 | 6 }[] = [];
  for (const r of results) {
    if (!r || typeof r.address !== "string" || !isPublicAddress(r.address)) return { ok: false, reason: "unsafe_address" };
    const n = normalizeIpv4Mapped(r.address);
    if (!n) return { ok: false, reason: "unsafe_address" };
    normalized.push(n);
  }
  const first = normalized.find((a) => a.family === 4) ?? (normalized[0] as { address: string; family: 4 | 6 });
  return { ok: true, address: first.address, family: first.family };
}
