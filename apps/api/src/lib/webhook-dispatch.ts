import { createHmac } from "node:crypto";
import { prisma } from "./prisma.js";
import { isFeatureEnabled } from "./plan-limits.js";

export async function dispatchWebhook(
  organizationId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Gate behind plan.api_access feature switch
  const apiEnabled = await isFeatureEnabled(prisma, organizationId, "api_access");
  if (!apiEnabled) return;

  const webhooks = await prisma.webhook.findMany({
    where: { organizationId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  });
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ event, organizationId, data: payload, timestamp: Date.now() });

  await Promise.allSettled(
    webhooks.map(async (wh) => {
      const sig = createHmac("sha256", wh.secret).update(body).digest("hex");
      const log = await prisma.webhookDeliveryLog.create({
        data: { webhookId: wh.id, status: "pending", attemptNumber: 1 },
      });
      let responseCode: number | null = null;
      let responseBody: string | null = null;
      let status: "success" | "failed" = "failed";
      try {
        const res = await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": `sha256=${sig}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 1000);
        status = res.ok ? "success" : "failed";
      } catch {
        // network error — leave status as failed
      }
      await prisma.webhookDeliveryLog.update({
        where: { id: log.id },
        data: { status, responseCode, responseBody, attemptedAt: new Date() },
      });
    })
  );
}
