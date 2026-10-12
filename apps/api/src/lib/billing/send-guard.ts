import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../prisma.js";
import { INTERNAL_ORG_NAMES } from "./internal-orgs.js";
import { loadBillingConfig } from "./settings.js";
import type { BillingConfig } from "./bands.js";

/** Days after a statement's due date before sending is paused. */
export const BLOCK_GRACE_DAYS = 7;
const DAY = 86_400_000;
const STANDING_TTL_MS = 60_000;
const ORG_LOOKUP_TTL_MS = 5 * 60_000;

/** Thrown instead of sending when an organization is blocked for non-payment. HTTP 402. */
export class BillingBlockedError extends Error {
  readonly statusCode = 402;
  readonly code = "BILLING_OVERDUE";
  constructor(readonly organizationId: string, readonly blockedSince: Date | null) {
    super("Sending is paused because a WBMSG statement is overdue. Pay it in Settings > Billing and sending resumes right away.");
    this.name = "BillingBlockedError";
  }
}

export type BlockingMode = "off" | "watch" | "enforce";
export type StandingState = "ok" | "overdue" | "blocked";

export interface Standing {
  state: StandingState;
  mode: BlockingMode;
  /** Earliest due date among the overdue statements, and when sending is (or was) paused. */
  dueAt: Date | null;
  blockAt: Date | null;
  overdueMonths: string[];
}

export const OK_STANDING: Standing = { state: "ok", mode: "off", dueAt: null, blockAt: null, overdueMonths: [] };

export interface StandingInput {
  mode: BlockingMode;
  now: Date;
  exempt: boolean;
  /** Issued statements that have a payment link, with their due dates. Statements without a link must not be passed in. */
  statements: Array<{ month: string; dueAt: Date | null }>;
}

/** Pure decision. A customer with no way to pay (no link) is never in the list, so can never be blocked. */
export function standingFrom(input: StandingInput): Standing {
  if (input.mode === "off" || input.exempt) return { ...OK_STANDING, mode: input.mode };
  const overdue = input.statements
    .filter((s): s is { month: string; dueAt: Date } => s.dueAt !== null && s.dueAt.getTime() < input.now.getTime())
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  if (overdue.length === 0) return { ...OK_STANDING, mode: input.mode };
  const dueAt = overdue[0]!.dueAt;
  const blockAt = new Date(dueAt.getTime() + BLOCK_GRACE_DAYS * DAY);
  return {
    state: blockAt.getTime() <= input.now.getTime() ? "blocked" : "overdue",
    mode: input.mode,
    dueAt,
    blockAt,
    overdueMonths: overdue.map((s) => s.month),
  };
}

/** Whether sending must actually be refused: past the grace period AND the owner has switched enforcement on. */
export function isEnforcedBlock(s: Standing): boolean {
  return s.state === "blocked" && s.mode === "enforce";
}

interface BlockSettings { exempt: boolean; pauseUntil: Date | null }

/** Reads the per-customer override stored in organization settings (settings.billingBlock). */
export function readBlockSettings(settings: unknown): BlockSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { exempt: false, pauseUntil: null };
  const b = (settings as Record<string, unknown>)["billingBlock"];
  if (!b || typeof b !== "object" || Array.isArray(b)) return { exempt: false, pauseUntil: null };
  const r = b as Record<string, unknown>;
  const until = typeof r["pauseUntil"] === "string" ? new Date(`${r["pauseUntil"]}T23:59:59.999Z`) : null;
  return { exempt: r["exempt"] === true, pauseUntil: until && !Number.isNaN(until.getTime()) ? until : null };
}

export function isExempt(orgName: string | null | undefined, settings: unknown, now: Date): boolean {
  if (orgName && INTERNAL_ORG_NAMES.includes(orgName)) return true;
  const s = readBlockSettings(settings);
  return s.exempt || (s.pauseUntil !== null && s.pauseUntil.getTime() >= now.getTime());
}

/** Reads one organization's standing from the database. Uses the stored config; any missing piece reads as "fine". */
export async function loadStanding(prisma: PrismaClient, organizationId: string, now: Date = new Date(), config?: BillingConfig): Promise<Standing> {
  const cfg = config ?? (await loadBillingConfig(prisma));
  if (cfg.blockingMode === "off") return { ...OK_STANDING, mode: "off" };
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, settings: true } });
  if (!org) return { ...OK_STANDING, mode: cfg.blockingMode };
  const exempt = isExempt(org.name, org.settings, now);
  if (exempt) return { ...OK_STANDING, mode: cfg.blockingMode };
  const statements = await prisma.billingStatement.findMany({
    where: { organizationId, status: "issued", paymentUrl: { not: null }, dueAt: { lt: now } },
    select: { month: true, dueAt: true },
  });
  return standingFrom({ mode: cfg.blockingMode, now, exempt, statements });
}

const standingCache = new Map<string, { at: number; standing: Standing }>();
const orgByPhone = new Map<string, { at: number; organizationId: string | null }>();
const warnedToday = new Map<string, string>();

/** Forget cached standings: one organization (after a payment or an override), or all of them. */
export function clearStandingCache(organizationId?: string): void {
  if (organizationId) standingCache.delete(organizationId);
  else standingCache.clear();
}

export function resetSendGuardCaches(): void {
  standingCache.clear();
  orgByPhone.clear();
  warnedToday.clear();
}

export async function cachedStanding(prisma: PrismaClient, organizationId: string, now: Date = new Date()): Promise<Standing> {
  const hit = standingCache.get(organizationId);
  if (hit && now.getTime() - hit.at < STANDING_TTL_MS) return hit.standing;
  const standing = await loadStanding(prisma, organizationId, now);
  standingCache.set(organizationId, { at: now.getTime(), standing });
  return standing;
}

async function organizationIdForPhone(prisma: PrismaClient, phoneNumberId: string, now: Date): Promise<string | null> {
  const hit = orgByPhone.get(phoneNumberId);
  if (hit && now.getTime() - hit.at < ORG_LOOKUP_TTL_MS) return hit.organizationId;
  const org = await prisma.organization.findFirst({ where: { phoneNumberId }, select: { id: true } });
  let id = org?.id ?? null;
  if (!id) {
    const vs = await prisma.vendorSetting.findFirst({ where: { key: "current_phone_number_id", value: phoneNumberId }, select: { organizationId: true } });
    id = vs?.organizationId ?? null;
  }
  orgByPhone.set(phoneNumberId, { at: now.getTime(), organizationId: id });
  return id;
}

/**
 * Called first by every function that sends to Meta. Throws BillingBlockedError only when the organization is past
 * the grace period AND enforcement is on. Fails open: if the organization or its standing cannot be determined for any
 * reason, the message is allowed, because a billing lookup must never take messaging down.
 */
export async function assertSendingAllowed(phoneNumberId: string, prisma: PrismaClient = defaultPrisma, now: Date = new Date()): Promise<void> {
  let organizationId: string | null;
  let standing: Standing;
  try {
    organizationId = await organizationIdForPhone(prisma, phoneNumberId, now);
    if (!organizationId) return;
    standing = await cachedStanding(prisma, organizationId, now);
  } catch (err) {
    console.warn("[billing-block] standing check failed, allowing the send", err instanceof Error ? err.name : "error");
    return;
  }
  if (isEnforcedBlock(standing)) throw new BillingBlockedError(organizationId, standing.blockAt);
  if (standing.state === "blocked" && standing.mode === "watch") {
    // Watch mode: nothing is refused. Say so once per organization per UTC day so the owner can see what enforcement would do.
    const day = now.toISOString().slice(0, 10);
    if (warnedToday.get(organizationId) !== day) {
      warnedToday.set(organizationId, day);
      console.warn(`[billing-block] WATCH: would have blocked organization ${organizationId} (overdue since ${standing.dueAt?.toISOString().slice(0, 10)})`);
    }
  }
}
