import type { PrismaClient } from "@prisma/client";
import { payloadLoggingEnabled, stripUnsafeText } from "./payload-capture.js";
import { safeErr } from "./safe-err.js";

export interface CallbackAttempt {
  organizationId: string; apiKeyId: string; url: string; method: string; fields: Record<string, string>;
  attempt: number; outcome: "delivered" | "http_error" | "network_error" | "dropped";
  httpStatus?: number | null; reason?: string | null; durationMs: number;
}

const MAX_FIELDS_JSON = 8000;
const MAX_FIELD_KEYS = 20;
const MAX_FIELD_VALUE = 200;
const DB_TIMEOUT_MS = 5000;

/** Drops userinfo, query string and fragment: only scheme, host, port and path are kept. */
function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return raw.split(/[?#]/)[0]!.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  }
}

function cleanFields(fields: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) clean[stripUnsafeText(k)] = stripUnsafeText(String(v));
  if (JSON.stringify(clean).length <= MAX_FIELDS_JSON) return clean;
  const capped: Record<string, string> = {};
  for (const [k, v] of Object.entries(clean).slice(0, MAX_FIELD_KEYS)) capped[k] = stripUnsafeText(v.slice(0, MAX_FIELD_VALUE));
  return capped;
}

/** Best-effort audit row for one delivery attempt. Off unless payload logging is on; never throws. */
export async function recordCallbackAttempt(prisma: PrismaClient, a: CallbackAttempt): Promise<void> {
  if (!payloadLoggingEnabled()) return;
  let timer: NodeJS.Timeout | undefined;
  try {
    const fields = cleanFields(a.fields);
    const write = prisma.apiCallbackAttempt.create({
      data: {
        organizationId: a.organizationId, apiKeyId: a.apiKeyId, messageId: fields["MessageUUID"] ?? null,
        url: sanitizeUrl(stripUnsafeText(a.url)).slice(0, 2000), method: a.method, fields, attempt: a.attempt,
        outcome: a.outcome, httpStatus: a.httpStatus ?? null,
        reason: a.reason ? stripUnsafeText(a.reason.slice(0, 300)) : null,
        durationMs: Math.max(0, Math.round(a.durationMs)),
      },
    });
    write.catch(() => {}); // a write that loses the race below must not become an unhandled rejection
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("attempt log timed out")), DB_TIMEOUT_MS); });
    await Promise.race([write, timeout]);
  } catch (err) {
    console.warn("[public-api-callbacks] attempt log failed", safeErr(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
