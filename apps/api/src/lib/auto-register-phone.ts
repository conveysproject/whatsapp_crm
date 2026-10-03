import { randomInt } from "crypto";

/**
 * Auto-registration of WhatsApp numbers that are connected but not on the Cloud API.
 * Spec: docs/prd-auto-register-phone.md. All state lives in vendor_settings (no schema change).
 * Everything here is dependency-injected (no Redis/Prisma imports) so it is unit-testable.
 */

// Same Graph version as lib/whatsapp.ts (WA_BASE is not exported there).
const WA_BASE = "https://graph.facebook.com/v25.0";

export const MAX_ATTEMPTS = 5;
export const CONNECT_GRACE_MS = 3 * 60 * 1000;
export const FIRST_CHECK_DELAY_MS = 3 * 60 * 1000;
const LADDER_MS = [15 * 60e3, 60 * 60e3, 6 * 60 * 60e3, 24 * 60 * 60e3];
const META_TIMEOUT_MS = 10_000;

/** Delay before the next check, given how many checks have run so far (1-based). */
export function nextDelayMs(checks: number): number {
  return LADDER_MS[Math.min(Math.max(checks, 1) - 1, LADDER_MS.length - 1)]!;
}

export const ELIGIBILITY_KEYS = [
  "current_phone_number_id",
  "whatsapp_access_token",
  "whatsapp_access_token_expired",
  "phone_info_status",
  "phone_info_is_on_biz_app",
  "webhook_verified_at",
  "wa_register_done",
  "wa_register_blocked",
  "wa_register_attempts",
  "wa_register_next_at",
] as const;

export const RESET_KEYS = [
  "wa_register_done",
  "wa_register_blocked",
  "wa_register_attempts",
  "wa_register_checks",
  "wa_register_next_at",
  "wa_register_last_at",
  "wa_register_last_result",
] as const;

export type Settings = Record<string, string>;

/** Pure, database-only skip rules (PRD "When the job must NOT do work"). null = eligible. */
export function skipReason(s: Settings, now: Date): string | null {
  if (!s["current_phone_number_id"] || !s["whatsapp_access_token"]) return "not_connected";
  if (s["whatsapp_access_token_expired"] === "1") return "token_expired";
  if (s["phone_info_status"] === "CONNECTED") return "connected";
  if (s["wa_register_done"] === "true") return "done";
  if (s["phone_info_is_on_biz_app"] === "true") return "biz_app";
  if (s["wa_register_blocked"]) return "blocked";
  if (parseInt(s["wa_register_attempts"] ?? "0", 10) >= MAX_ATTEMPTS) return "max_attempts";
  const nextAt = Date.parse(s["wa_register_next_at"] ?? "");
  if (!Number.isNaN(nextAt) && nextAt > now.getTime()) return "backoff";
  const verifiedAt = Date.parse(s["webhook_verified_at"] ?? "");
  if (!Number.isNaN(verifiedAt) && now.getTime() - verifiedAt < CONNECT_GRACE_MS) return "connect_grace";
  return null;
}

export interface Deps {
  getSettings(orgId: string): Promise<Settings>;
  setSettings(orgId: string, kv: Record<string, string>): Promise<void>;
  acquireLock(orgId: string): Promise<boolean>;
  releaseLock(orgId: string): Promise<void>;
  fetchFn: typeof fetch;
  audit(entry: { actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown> }): Promise<void>;
  now(): Date;
  randomPin(): string;
}

export interface ProcessResult {
  outcome: string;
  /** Delay for the next check, or null when nothing more should be scheduled. */
  nextDelayMs: number | null;
}

type MetaReply = { status: number | null; body: unknown };

async function meta(deps: Deps, path: string, token: string, init?: { method: "POST"; body: string }): Promise<MetaReply> {
  try {
    const res = await deps.fetchFn(`${WA_BASE}/${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, ...(init ? { "Content-Type": "application/json" } : {}) },
      ...(init ? { body: init.body } : {}),
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch {
    return { status: null, body: {} };
  }
}

type MetaError = { error?: { type?: string; code?: number } };
type FailureKind = "transient" | "token_invalid" | "permission_denied" | "not_found" | "failed";

/** Classified by HTTP status and Meta's error type; unrecognised errors count as a failed attempt. */
function classify(r: MetaReply): FailureKind {
  const e = (r.body as MetaError).error;
  if (r.status === null || r.status === 429 || r.status >= 500) return "transient";
  if (r.status === 401 || (e?.type === "OAuthException" && e.code === 190)) return "token_invalid";
  if (r.status === 403) return "permission_denied";
  if (r.status === 404) return "not_found";
  return "failed";
}

/** Result text stored on the org: status and Meta error type/code only, never tokens, PINs or messages. */
function describe(r: MetaReply): string {
  const e = (r.body as MetaError).error;
  return `http_${r.status ?? "network"}${e?.type ? `:${e.type}` : ""}${e?.code ? `:${e.code}` : ""}`;
}

type PhoneInfo = { status?: string; platform_type?: string; is_on_biz_app?: boolean; code_verification_status?: string };
const isRegistered = (i: PhoneInfo): boolean => i.platform_type === "CLOUD_API" || i.status === "CONNECTED";

export async function processOrg(deps: Deps, orgId: string): Promise<ProcessResult> {
  if (!(await deps.acquireLock(orgId))) return { outcome: "locked", nextDelayMs: null };
  try {
    return await run(deps, orgId);
  } finally {
    await deps.releaseLock(orgId);
  }
}

async function run(deps: Deps, orgId: string): Promise<ProcessResult> {
  const s = await deps.getSettings(orgId);
  const now = deps.now();
  const reason = skipReason(s, now);

  if (reason === "biz_app") {
    await deps.setSettings(orgId, { wa_register_done: "true", wa_register_last_at: now.toISOString(), wa_register_last_result: "skipped_biz_app" });
    return { outcome: "skipped_biz_app", nextDelayMs: null };
  }
  if (reason === "backoff") {
    return { outcome: "skip_backoff", nextDelayMs: Math.max(Date.parse(s["wa_register_next_at"]!) - now.getTime(), 60_000) };
  }
  if (reason === "connect_grace") {
    return { outcome: "skip_connect_grace", nextDelayMs: CONNECT_GRACE_MS };
  }
  if (reason) return { outcome: `skip_${reason}`, nextDelayMs: null };

  const token = s["whatsapp_access_token"]!;
  const phoneId = s["current_phone_number_id"]!;
  const checks = parseInt(s["wa_register_checks"] ?? "0", 10) + 1;
  const attempts = parseInt(s["wa_register_attempts"] ?? "0", 10);
  const stamp = { wa_register_checks: String(checks), wa_register_last_at: now.toISOString() };
  const backoff = () => ({ wa_register_next_at: new Date(now.getTime() + nextDelayMs(checks)).toISOString() });

  // Handles a failed Meta reply uniformly. `countAttempt` is true only for a failed /register call.
  const fail = async (r: MetaReply, countAttempt: boolean): Promise<ProcessResult> => {
    const kind = classify(r);
    if (kind === "token_invalid" || kind === "permission_denied" || kind === "not_found") {
      await deps.setSettings(orgId, { ...stamp, wa_register_blocked: kind, wa_register_last_result: describe(r) });
      return { outcome: "blocked", nextDelayMs: null };
    }
    if (kind === "transient") {
      await deps.setSettings(orgId, { ...stamp, ...backoff(), wa_register_last_result: `transient:${describe(r)}` });
      return { outcome: "transient_error", nextDelayMs: nextDelayMs(checks) };
    }
    const newAttempts = attempts + (countAttempt ? 1 : 0);
    const giveUp = newAttempts >= MAX_ATTEMPTS;
    await deps.setSettings(orgId, {
      ...stamp,
      ...(countAttempt ? { wa_register_attempts: String(newAttempts) } : {}),
      ...(giveUp ? {} : backoff()),
      wa_register_last_result: describe(r),
    });
    return { outcome: "register_failed", nextDelayMs: giveUp ? null : nextDelayMs(checks) };
  };

  const done = (result: string) => ({ ...stamp, wa_register_done: "true", phone_info_status: "CONNECTED", wa_register_last_result: result });

  const infoRes = await meta(deps, `${phoneId}?fields=status,platform_type,is_on_biz_app,code_verification_status`, token);
  if (infoRes.status === null || infoRes.status >= 400) return fail(infoRes, false);
  const info = infoRes.body as PhoneInfo;

  if (isRegistered(info)) {
    await deps.setSettings(orgId, done("already_registered"));
    return { outcome: "already_registered", nextDelayMs: null };
  }
  if (info.is_on_biz_app === true) {
    await deps.setSettings(orgId, { ...stamp, wa_register_done: "true", wa_register_last_result: "skipped_biz_app" });
    return { outcome: "skipped_biz_app", nextDelayMs: null };
  }
  if (info.code_verification_status !== "VERIFIED") {
    await deps.setSettings(orgId, { ...stamp, ...backoff(), wa_register_last_result: "waiting_for_verification" });
    return { outcome: "waiting_for_verification", nextDelayMs: nextDelayMs(checks) };
  }

  // Store the PIN before calling Meta so a retry (or a crash) reuses the same one.
  const pin = s["wa_register_pin"] || deps.randomPin();
  if (!s["wa_register_pin"]) await deps.setSettings(orgId, { wa_register_pin: pin });

  const reg = await meta(deps, `${phoneId}/register`, token, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  await deps.audit({
    actorId: "system:auto-register",
    action: "whatsapp.auto_register",
    targetType: "organization",
    targetId: orgId,
    metadata: { phoneNumberId: phoneId, result: reg.status !== null && reg.status < 400 ? "ok" : describe(reg) },
  });
  if (reg.status === null || reg.status >= 400) return fail(reg, true);

  const after = await meta(deps, `${phoneId}?fields=status,platform_type`, token);
  if (after.status !== null && after.status < 400 && isRegistered(after.body as PhoneInfo)) {
    await deps.setSettings(orgId, done("registered"));
    return { outcome: "registered", nextDelayMs: null };
  }
  const newAttempts = attempts + 1;
  await deps.setSettings(orgId, {
    ...stamp,
    wa_register_attempts: String(newAttempts),
    ...(newAttempts >= MAX_ATTEMPTS ? {} : backoff()),
    wa_register_last_result: "registered_not_connected",
  });
  return { outcome: "registered_not_connected", nextDelayMs: newAttempts >= MAX_ATTEMPTS ? null : nextDelayMs(checks) };
}

interface SelectPrisma {
  organization: { findMany(args: { where: { status: string }; select: { id: true } }): Promise<Array<{ id: string }>> };
  vendorSetting: {
    findMany(args: {
      where: { organizationId: { in: string[] }; key: { in: string[] } };
      select: { organizationId: true; key: true; value: true };
    }): Promise<Array<{ organizationId: string; key: string; value: string | null }>>;
  };
}

/** Database-only: the orgs worth a Meta call right now (no HTTP, so a skipped org is nearly free). */
export async function selectEligibleOrgIds(prisma: SelectPrisma, now: Date, limit: number): Promise<string[]> {
  const orgs = await prisma.organization.findMany({ where: { status: "active" }, select: { id: true } });
  if (orgs.length === 0) return [];
  const rows = await prisma.vendorSetting.findMany({
    where: { organizationId: { in: orgs.map((o) => o.id) }, key: { in: [...ELIGIBILITY_KEYS] } },
    select: { organizationId: true, key: true, value: true },
  });
  const byOrg = new Map<string, Settings>();
  for (const r of rows) {
    const m = byOrg.get(r.organizationId) ?? {};
    m[r.key] = r.value ?? "";
    byOrg.set(r.organizationId, m);
  }
  const eligible: string[] = [];
  for (const o of orgs) {
    if (eligible.length >= limit) break;
    const s = byOrg.get(o.id);
    if (s && skipReason(s, now) === null) eligible.push(o.id);
  }
  return eligible;
}

export const randomPin = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");
