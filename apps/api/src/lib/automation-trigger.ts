import type { PrismaClient } from "@prisma/client";
import { delayedResponseQueue } from "./queue.js";
import { sendTextMessage } from "./whatsapp.js";
import { recordOutbound } from "./record-outbound.js";

// ---------------------------------------------------------------------------
// Types used by runAutomationTrigger
// ---------------------------------------------------------------------------

interface AutoTriggerContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  createdAt: Date;
  lastMessageAt?: Date | null;
}

interface AutoTriggerConversation {
  id: string;
  status: string;
  lastInboundAt?: Date | null;
}

interface AutoTriggerOrg {
  phoneNumberId: string | null;
  wabaAccessToken: string | null;
}

function interpolateVars(
  template: string,
  contact: Pick<AutoTriggerContact, "firstName" | "lastName" | "phoneNumber" | "email">
): string {
  const fullName =
    `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || contact.phoneNumber;
  return template
    .replace(/\{\{first_name\}\}/gi, contact.firstName ?? "")
    .replace(/\{\{last_name\}\}/gi, contact.lastName ?? "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{phone\}\}/gi, contact.phoneNumber)
    .replace(/\{\{email\}\}/gi, contact.email ?? "");
}

/**
 * Main automation trigger — called on every inbound message after it is stored.
 * Runs Welcome, OOO, and Delayed Response logic in order.
 */
export async function runAutomationTrigger(
  prisma: PrismaClient,
  organizationId: string,
  conversation: AutoTriggerConversation,
  contact: AutoTriggerContact,
  org: AutoTriggerOrg,
  messageReceivedAt: Date
): Promise<void> {
  const settings = await prisma.orgAutomationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings) return;

  const now = messageReceivedAt;

  // -------------------------------------------------------------------------
  // 1. WELCOME CHECK (runs regardless of business hours)
  // -------------------------------------------------------------------------
  if (settings.welcomeEnabled) {
    // Is this the contact's first-ever message in this conversation?
    const priorMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        organizationId,
        direction: "inbound",
        sentAt: { lt: messageReceivedAt },
      },
    });
    const isFirstContact = !priorMessage;

    // Was last inbound more than 24 h ago?
    const isReturning =
      !isFirstContact &&
      conversation.lastInboundAt != null &&
      now.getTime() - new Date(conversation.lastInboundAt).getTime() > 24 * 60 * 60 * 1000;

    let welcomeText: string | null = null;

    if (isFirstContact || isReturning) {
      if (settings.welcomePersonalized) {
        welcomeText = isFirstContact
          ? (settings.welcomeNewMessage ?? null)
          : (settings.welcomeReturningMessage ?? null);
      } else {
        welcomeText = settings.welcomeMessage ?? null;
      }
    }

    if (welcomeText && org.phoneNumberId && org.wabaAccessToken) {
      const interpolated = interpolateVars(welcomeText, contact);
      const { messageId } = await sendTextMessage(
        org.phoneNumberId,
        contact.phoneNumber,
        interpolated,
        org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId: conversation.id,
        organizationId,
        contentType: "text",
        body: interpolated,
        whatsappMessageId: messageId,
      });

      // Optionally kick off a welcome flow
      if (settings.welcomeFlowId) {
        const flow = await prisma.flow.findFirst({
          where: { id: settings.welcomeFlowId, organizationId, isActive: true },
          select: { id: true, flowDefinition: true },
        });
        if (flow) {
          // Lazy import avoids circular dependency with flow-runner
          const { runFlow } = (await import("./flow-runner.js")) as {
            runFlow: (
              prisma: PrismaClient,
              flowId: string,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              flowDefinition: any,
              payload: {
                conversationId: string;
                organizationId: string;
                contactPhone: string;
                messageBody: string;
              }
            ) => Promise<void>;
          };
          await runFlow(prisma, flow.id, flow.flowDefinition, {
            conversationId: conversation.id,
            organizationId,
            contactPhone: contact.phoneNumber,
            messageBody: "",
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. BUSINESS HOURS CHECK
  // -------------------------------------------------------------------------
  const withinHours = await isWithinBusinessHours(prisma, organizationId, now);

  // -------------------------------------------------------------------------
  // 3. OOO CHECK (outside hours only, conversation not already open-with-agent)
  // -------------------------------------------------------------------------
  if (!withinHours && settings.oooEnabled && settings.oooMessage) {
    if (conversation.status !== "open" && org.phoneNumberId && org.wabaAccessToken) {
      const oooText = interpolateVars(settings.oooMessage, contact);
      const { messageId } = await sendTextMessage(
        org.phoneNumberId,
        contact.phoneNumber,
        oooText,
        org.wabaAccessToken
      );
      await recordOutbound(prisma, {
        conversationId: conversation.id,
        organizationId,
        contentType: "text",
        body: oooText,
        whatsappMessageId: messageId,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. DELAYED RESPONSE SCHEDULING
  // -------------------------------------------------------------------------
  if (settings.delayedEnabled && (withinHours || settings.delayedSendWithOoo)) {
    const jobId = `delayed-response:${conversation.id}`;
    const delayMs = settings.delayedMinutes * 60 * 1000;

    // Cancel any existing pending job for this conversation before re-scheduling
    try {
      const existingJob = await delayedResponseQueue.getJob(jobId);
      if (existingJob) await existingJob.remove();
    } catch {
      // Non-fatal — job may have already fired
    }

    await delayedResponseQueue.add(
      "fire",
      {
        conversationId: conversation.id,
        organizationId,
        scheduledAt: now.toISOString(),
      } satisfies { conversationId: string; organizationId: string; scheduledAt: string },
      { jobId, delay: delayMs }
    );
  }
}

/**
 * Cancel any pending delayed-response job for a conversation.
 * Called when an agent sends an outbound message.
 */
export async function cancelDelayedResponseJob(conversationId: string): Promise<void> {
  const jobId = `delayed-response:${conversationId}`;
  try {
    const job = await delayedResponseQueue.getJob(jobId);
    if (job) await job.remove();
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------

/**
 * Returns true if `now` falls within any BusinessHours slot for the org.
 * Uses org's timezone stored in `Organization.settings.timezone` (defaults to UTC).
 * Compares local wall-clock time in that timezone against each slot's HH:MM range.
 */
export async function isWithinBusinessHours(
  prisma: PrismaClient,
  organizationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const timezone = typeof settings["timezone"] === "string" ? settings["timezone"] : "UTC";

  const slots = await prisma.businessHours.findMany({
    where: { organizationId },
  });

  if (slots.length === 0) return false;

  // Get current local HH:MM in the org timezone
  let localHour: number;
  let localMinute: number;
  let localDayOfWeek: number;

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
      timeZone: timezone,
    });
    const parts = formatter.formatToParts(now);
    localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    localMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    // Get day of week (0=Sun…6=Sat) using a locale-independent approach
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone,
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    localDayOfWeek = dayMap[dayStr] ?? now.getDay();
  } catch {
    // Fallback to UTC if timezone is invalid
    localHour = now.getUTCHours();
    localMinute = now.getUTCMinutes();
    localDayOfWeek = now.getUTCDay();
  }

  const currentMinutes = localHour * 60 + localMinute;

  return slots.some((slot) => {
    if (slot.dayOfWeek !== localDayOfWeek) return false;
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);
    // Normal range (e.g. 09:00–18:00); end-midnight is handled as exclusive
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  });
}
