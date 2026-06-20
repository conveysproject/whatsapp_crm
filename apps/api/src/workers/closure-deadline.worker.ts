import { Queue, Worker } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { computeClosureDeadline } from "../lib/closure-deadline.js";
import { sendMail } from "../lib/mail.js";

export const closureDeadlineQueue = new Queue("closure-deadline", { connection: redisConnection });
closureDeadlineQueue.on("error", (err) => console.error(`[closure-deadline] queue error: ${err.message}`));

interface ContactConfig {
  closureDeadlineDays?: number | null;
  closureLeadStatusIds?: string[];
}

async function processClosureDeadlines(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true, settings: true } });
  for (const org of orgs) {
    const cc = ((org.settings as Record<string, unknown> | null)?.["contactConfig"] ?? {}) as ContactConfig;
    const days = typeof cc.closureDeadlineDays === "number" ? cc.closureDeadlineDays : null;
    if (!days || days <= 0) continue;
    const closureIds = cc.closureLeadStatusIds ?? [];

    // 1) Backfill closureDeadline for in-sales-cycle contacts that lack one
    const needsDeadline = await prisma.contact.findMany({
      where: { organizationId: org.id, deletedAt: null, leadStatusId: { not: null }, closureDeadline: null },
      select: { id: true, createdAt: true },
      take: 1000,
    });
    for (const c of needsDeadline) {
      await prisma.contact.update({
        where: { id: c.id },
        data: { closureDeadline: computeClosureDeadline(c.createdAt, days) },
      });
    }

    // 2) Alert account owners of overdue contacts not in a closure status (once)
    const overdue = await prisma.contact.findMany({
      where: {
        organizationId: org.id,
        deletedAt: null,
        closureDeadline: { lt: new Date() },
        closureAlertedAt: null,
        assignedUserId: { not: null },
        ...(closureIds.length > 0 ? { NOT: { leadStatusId: { in: closureIds } } } : {}),
      },
      select: { id: true, name: true, phoneNumber: true, assignedUserId: true },
      take: 500,
    });

    for (const c of overdue) {
      const userId = c.assignedUserId!;
      const label = c.name ?? c.phoneNumber;
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          userId,
          type: "closure_overdue",
          message: `Contact ${label} has passed its closure deadline without being closed.`,
          data: { contactId: c.id },
        },
      });
      try {
        const user = await prisma.user.findFirst({ where: { id: userId, organizationId: org.id }, select: { email: true } });
        if (user?.email) {
          await sendMail({
            to: user.email,
            subject: `Closure deadline passed: ${label}`,
            html: `<p>The contact <strong>${label}</strong> has passed its closure deadline without reaching a closure status.</p><p>Please review and update the contact.</p>`,
          });
        }
      } catch (err) {
        console.error(`[closure-deadline] email failed for contact=${c.id}: ${(err as Error).message}`);
      }
      await prisma.contact.update({ where: { id: c.id }, data: { closureAlertedAt: new Date() } });
    }
  }
}

export function startClosureDeadlineWorker(): Worker {
  const worker = new Worker(
    "closure-deadline",
    async () => { await processClosureDeadlines(); },
    { connection: redisConnection }
  );
  worker.on("error", (err) => console.error(`[closure-deadline] worker error: ${err.message}`));
  return worker;
}

export async function scheduleClosureDeadlineCron(): Promise<void> {
  await closureDeadlineQueue.add(
    "hourly-check",
    {},
    { repeat: { pattern: "0 * * * *" }, jobId: "closure-deadline-cron" }
  );
}
