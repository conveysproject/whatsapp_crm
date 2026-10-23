// Sends an organization's transactional email through its own verified email provider, with a safe fallback to
// our default sender. The email is the priority: every bookkeeping step (cap counter, failure counters, status
// flip, notification) is wrapped so that no failure in it can stop the email from being sent.
import type { PrismaClient } from "@prisma/client";
import { resolveBrand } from "../brand.js";
import { brandMailExtras, escapeHtml, subjectText, type EmailBrand } from "../email-brand.js";
import { sendMail } from "../mail.js";
import { redis } from "../redis.js";
import { incrWithTtl } from "../redis-counter.js";
import { decryptJson } from "../secret-box.js";
import { buildTransport, type ProviderConfig } from "./transport.js";

export interface MailLogger {
  warn(obj: object, msg: string): void;
}

interface EmailRoute {
  ownerOrgId: string;
  settingsId: string;
  provider: string;
  config: ProviderConfig;
  from: { name: string | null; address: string };
  replyTo: string | null;
  consecutiveFailures: number;
  /** Row snapshot: bookkeeping only applies while the settings are unchanged since the route was resolved. */
  updatedAt: Date;
}

const DEFAULT_HOURLY_CAP = 200;
const CAP_WINDOW_SECONDS = 3600;
const FAIL_THRESHOLD = 3;
const MAX_NOTIFY = 5;
const MAX_REASON = 120;
const FIXED_FAILURE = "send failed";

const consoleLogger: MailLogger = { warn: (_o, m) => console.warn(m) };

function hourlyCap(): number {
  const n = Number(process.env["ORG_EMAIL_HOURLY_CAP"]);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_HOURLY_CAP;
}

// Fixed reasons (providers/common.ts, providers/smtp.ts) that mean the message or recipient was refused, not that the
// provider connection is broken. They must not count toward the failing flip: a user could otherwise send to
// suppressed or invalid addresses until the parent's provider is switched off.
const RECIPIENT_LEVEL = ["rejected by provider", "rejected by server", "temporary failure", "invalid email address"];

/** True when the failure says the connection or credentials are unhealthy. */
export function countsTowardFailing(reason: string): boolean {
  return !RECIPIENT_LEVEL.some((r) => reason.includes(r));
}

/**
 * The verified settings that apply to `orgId`: its own when it is a parent, else its parent's when the parent is
 * approved for white-label. Unverified and failing settings are ignored. Never throws; null means "use the default".
 */
async function resolveEmailRoute(
  prisma: PrismaClient,
  orgId: string,
  logger: MailLogger = consoleLogger,
): Promise<EmailRoute | null> {
  let settingsRow: {
    id: string;
    organizationId: string;
    provider: string;
    fromAddress: string;
    fromName: string | null;
    replyTo: string | null;
    configEnc: string;
    status: string;
    consecutiveFailures: number;
    updatedAt: Date;
  } | null;
  let ownerOrgId: string;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        isParent: true,
        parentOrganizationId: true,
        parentOrganization: { select: { isParent: true, whiteLabelEnabled: true } },
      },
    });
    if (!org) return null;
    if (org.isParent) ownerOrgId = orgId;
    else if (org.parentOrganizationId && org.parentOrganization?.isParent && org.parentOrganization.whiteLabelEnabled) {
      ownerOrgId = org.parentOrganizationId;
    } else return null;
    settingsRow = await prisma.orgEmailSettings.findUnique({ where: { organizationId: ownerOrgId } });
  } catch {
    logger.warn({ orgId }, "email route lookup failed; using the default sender");
    return null;
  }
  if (!settingsRow || settingsRow.status !== "verified") return null;
  let config: ProviderConfig;
  try {
    const stored = decryptJson<Record<string, unknown>>(settingsRow.configEnc);
    config = { ...stored, provider: settingsRow.provider } as unknown as ProviderConfig;
  } catch {
    // Never log the error: it must not carry key or credential details.
    logger.warn({ ownerOrgId }, "email provider settings cannot be read; using the default sender");
    return null;
  }
  return {
    ownerOrgId,
    settingsId: settingsRow.id,
    provider: settingsRow.provider,
    config,
    from: { name: settingsRow.fromName, address: settingsRow.fromAddress },
    replyTo: settingsRow.replyTo,
    consecutiveFailures: settingsRow.consecutiveFailures,
    updatedAt: settingsRow.updatedAt,
  };
}

export interface OrgMailArgs {
  orgId: string | null;
  to: string;
  subject: string;
  html: string;
  brand?: EmailBrand | null;
  logger?: MailLogger;
}

/**
 * Records one failure; returns true when this call moved the setting from verified to failing. Conditional on the
 * row snapshot (updatedAt, which the bookkeeping itself preserves), so a failure from before the settings were
 * changed or re-verified is skipped silently.
 */
async function recordFailure(prisma: PrismaClient, route: EmailRoute, reason: string, logger: MailLogger): Promise<boolean> {
  try {
    if (!countsTowardFailing(reason)) {
      await prisma.orgEmailSettings.updateMany({
        where: { id: route.settingsId, updatedAt: route.updatedAt },
        data: { lastError: reason, updatedAt: route.updatedAt },
      });
      return false;
    }
    const updated = await prisma.orgEmailSettings.update({
      where: { id: route.settingsId, updatedAt: route.updatedAt },
      data: { consecutiveFailures: { increment: 1 }, lastError: reason, updatedAt: route.updatedAt },
      select: { consecutiveFailures: true },
    });
    if (updated.consecutiveFailures < FAIL_THRESHOLD) return false;
    const flipped = await prisma.orgEmailSettings.updateMany({
      where: { id: route.settingsId, status: "verified", updatedAt: route.updatedAt },
      data: { status: "failing", updatedAt: route.updatedAt },
    });
    return flipped.count > 0;
  } catch (err) {
    // P2025: no row matched the snapshot (settings changed meanwhile). Nothing to record, nothing to log.
    if ((err as { code?: unknown } | null)?.code !== "P2025") {
      logger.warn({ ownerOrgId: route.ownerOrgId }, "could not record an email provider failure");
    }
    return false;
  }
}

/** One short fixed notice to the owner org's admins, from the default sender. Never throws. */
async function notifyAdmins(prisma: PrismaClient, ownerOrgId: string, reason: string, logger: MailLogger): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { organizationId: ownerOrgId, role: "admin", isActive: true },
      select: { email: true },
      take: MAX_NOTIFY,
    });
    if (admins.length === 0) return;
    let name = "";
    try {
      const b = await resolveBrand(prisma, ownerOrgId);
      name = b.isDefault ? "" : subjectText(b.name);
    } catch {
      name = "";
    }
    const html =
      `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">` +
      `<p>Your email provider connection${name ? ` for ${escapeHtml(name)}` : ""} stopped working after repeated failures. The last error was: ${escapeHtml(reason)}.</p>` +
      `<p>Open Settings &gt; Email to test it again. Until then, emails are sent from our address.</p></div>`;
    await Promise.allSettled(
      admins.map(async (a) => {
        try {
          await sendMail({ to: a.email, subject: "Your email provider connection stopped working", html });
        } catch {
          logger.warn({ ownerOrgId }, "email provider failure notice could not be sent");
        }
      }),
    );
  } catch {
    logger.warn({ ownerOrgId }, "email provider failure notice could not be prepared");
  }
}

export async function sendOrgMail(prisma: PrismaClient, args: OrgMailArgs): Promise<void> {
  const logger = args.logger ?? consoleLogger;
  const defaultSend = () =>
    sendMail({ to: args.to, subject: args.subject, html: args.html, ...brandMailExtras(args.brand) });

  if (!args.orgId) return defaultSend();
  const route = await resolveEmailRoute(prisma, args.orgId, logger);
  if (!route) return defaultSend();

  let useDefault = false;
  try {
    const count = await incrWithTtl(redis, `org-email-cap:${route.ownerOrgId}`, CAP_WINDOW_SECONDS);
    useDefault = count > hourlyCap();
  } catch {
    logger.warn({ ownerOrgId: route.ownerOrgId }, "email cap counter unavailable; using the default sender");
    useDefault = true;
  }
  if (useDefault) return defaultSend();

  const extras = brandMailExtras(args.brand);
  const fromName = route.from.name ?? extras.fromName ?? null;
  const replyTo = route.replyTo ?? extras.replyTo;

  let reason: string | null = null;
  try {
    const res = await buildTransport(route.config).send({
      from: { name: fromName, address: route.from.address },
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (!res.ok) reason = String(res.reason).slice(0, MAX_REASON) || FIXED_FAILURE;
  } catch {
    // Never use the error text: it could carry provider or credential details.
    reason = FIXED_FAILURE;
  }

  if (reason === null) {
    if (route.consecutiveFailures > 0) {
      try {
        await prisma.orgEmailSettings.updateMany({
          where: { id: route.settingsId, consecutiveFailures: { gt: 0 } },
          data: { consecutiveFailures: 0, lastError: null },
        });
      } catch {
        logger.warn({ ownerOrgId: route.ownerOrgId }, "could not reset the email provider failure counter");
      }
    }
    return;
  }

  // The email goes out first (started before any bookkeeping), exactly once, from the default sender.
  const fallback = defaultSend();
  fallback.catch(() => undefined);
  if (await recordFailure(prisma, route, reason, logger)) {
    await notifyAdmins(prisma, route.ownerOrgId, reason, logger);
  }
  await fallback;
}
