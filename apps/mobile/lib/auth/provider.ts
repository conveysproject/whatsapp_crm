export type AuthMode = "clerk" | "wbmsg";
export type ConfiguredAuthMode = AuthMode | "auto";

/** EXPO_PUBLIC_AUTH_PROVIDER: `clerk` (default), `wbmsg`, or `auto` (decided from the API, see below). Anything else means clerk. */
export function parseAuthMode(raw: string | undefined): ConfiguredAuthMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "wbmsg" || v === "auto" ? v : "clerk";
}

export type ProbeAnswer = AuthMode | "unknown";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Reads the answer of GET /v1/auth/.well-known/jwks.json. Only an exact answer counts: a real key set means WBMSG login,
 * the API's own JSON 404 means Clerk (every /v1/auth route 404s in Clerk mode). Proxies, captive portals and errors are "unknown".
 */
export function classifyProbe(status: number, body: unknown): ProbeAnswer {
  const b = asRecord(body);
  if (status === 200 && Array.isArray(b?.["keys"])) return "wbmsg";
  if (status === 404 && asRecord(b?.["error"])?.["code"] === "NOT_FOUND") return "clerk";
  return "unknown";
}

/** What `auto` mode remembers between launches (stored in SecureStore as JSON). */
export interface ModeRecord {
  mode: AuthMode | null;
  /** Consecutive launches that saw a Clerk answer while running WBMSG login. */
  clerkSeen: number;
}

export const EMPTY_RECORD: ModeRecord = { mode: null, clerkSeen: 0 };

export function parseModeRecord(raw: string | null): ModeRecord {
  if (!raw) return EMPTY_RECORD;
  try {
    const r = asRecord(JSON.parse(raw));
    const mode = r?.["mode"] === "wbmsg" || r?.["mode"] === "clerk" ? (r["mode"] as AuthMode) : null;
    const seen = typeof r?.["clerkSeen"] === "number" && r["clerkSeen"] >= 0 ? (r["clerkSeen"] as number) : 0;
    return { mode, clerkSeen: seen };
  } catch {
    return EMPTY_RECORD;
  }
}

/**
 * The mode for this launch, decided without the network so the app renders at once.
 * A stored WBMSG session with no record keeps WBMSG login. When the record says Clerk but a WBMSG session is still
 * stored, a downgrade was decided on an earlier launch: the WBMSG keys are wiped now, as the mode takes effect.
 */
export function startMode(record: ModeRecord, hasWbmsgSession: boolean): { mode: AuthMode; wipeWbmsg: boolean } {
  const mode = record.mode ?? (hasWbmsgSession ? "wbmsg" : "clerk");
  return { mode, wipeWbmsg: mode === "clerk" && hasWbmsgSession };
}

/**
 * The record to store after this launch's background probe. The new mode only applies on the next launch.
 * Clerk → WBMSG switches at once; WBMSG → Clerk needs a Clerk answer on two launches in a row (a single odd answer
 * must not sign people out). "unknown" changes nothing.
 */
export function recordAfterProbe(record: ModeRecord, running: AuthMode, answer: ProbeAnswer): ModeRecord {
  if (answer === "unknown") return { mode: record.mode ?? running, clerkSeen: record.clerkSeen };
  if (answer === "wbmsg") return { mode: "wbmsg", clerkSeen: 0 };
  if (running !== "wbmsg") return { mode: "clerk", clerkSeen: 0 };
  const seen = record.clerkSeen + 1;
  return seen >= 2 ? { mode: "clerk", clerkSeen: 0 } : { mode: "wbmsg", clerkSeen: seen };
}
