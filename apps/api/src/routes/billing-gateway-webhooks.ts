import type { FastifyPluginAsync } from "fastify";
import type { PlanTier, Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { activateManualSubscription } from "./billing.js";
import { isBillableTier, isPaidAmountSufficient } from "../lib/billing/catalog.js";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const billingGatewayWebhooksRouter: FastifyPluginAsync = async (fastify) => {
  // Raw bytes so HMAC verification does not depend on JSON re-serialization.
  fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  function parse<T>(body: unknown): T | null {
    if (!Buffer.isBuffer(body)) return null;
    try { return JSON.parse(body.toString("utf8")) as T; } catch { return null; }
  }

  // ── Razorpay ────────────────────────────────────────────────────────────
  type RzpEvent = { event?: string; payload?: { payment?: { entity?: { amount?: number; currency?: string; notes?: { organizationId?: string; planId?: string; manualSubId?: string } } } } };
  fastify.post("/billing/razorpay/webhook", { config: { public: true } }, async (request, reply) => {
    const signature = request.headers["x-razorpay-signature"];
    const event = parse<RzpEvent>(request.body);
    if (typeof signature !== "string" || !event) return reply.status(400).send({ error: "Invalid signature" });
    const entity = event.payload?.payment?.entity;
    const orgId = entity?.notes?.organizationId;
    // Platform secret only: tenant-supplied credentials must never drive plan changes.
    const secret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
    const expected = createHmac("sha256", secret).update(request.body as Buffer).digest("hex");
    if (!secret || !safeEqual(signature, expected)) return reply.status(400).send({ error: "Invalid signature" });

    if (event.event === "payment.captured" && orgId && entity) {
      const { planId, manualSubId } = entity.notes ?? {};
      if (manualSubId) {
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (isBillableTier(planId) && isPaidAmountSufficient(planId, entity.currency ?? "", entity.amount ?? NaN)) {
        const org = await fastify.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
        const existing = (org?.settings as Record<string, unknown>) ?? {};
        await fastify.prisma.organization.update({
          where: { id: orgId },
          data: {
            planTier: planId as PlanTier,
            settings: ({ ...existing, razorpayPlanId: planId, activatedAt: new Date().toISOString() } as Record<string, unknown>) as Prisma.InputJsonValue,
          },
        });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: entity.currency, amount: entity.amount }, "razorpay payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });

  // ── Paystack ────────────────────────────────────────────────────────────
  type PsEvent = { event?: string; data?: { amount?: number; currency?: string; metadata?: { organizationId?: string; planId?: string; manualSubId?: string } } };
  fastify.post("/billing/paystack/webhook", { config: { public: true } }, async (request, reply) => {
    const hash = request.headers["x-paystack-signature"];
    const event = parse<PsEvent>(request.body);
    if (typeof hash !== "string" || !event) return reply.status(400).send({ error: "Invalid signature" });
    const orgId = event.data?.metadata?.organizationId;
    // Platform secret only: tenant-supplied credentials must never drive plan changes.
    const secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "";
    const expected = createHmac("sha512", secretKey).update(request.body as Buffer).digest("hex");
    if (!secretKey || !safeEqual(hash, expected)) return reply.status(400).send({ error: "Invalid signature" });

    if (event.event === "charge.success" && orgId && event.data) {
      const { planId, manualSubId } = event.data.metadata ?? {};
      if (manualSubId) {
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (isBillableTier(planId) && isPaidAmountSufficient(planId, event.data.currency ?? "", event.data.amount ?? NaN)) {
        await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: event.data.currency, amount: event.data.amount }, "paystack payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });

  // ── YooMoney / YooKassa (notifications are unsigned: confirm with the gateway) ──
  type YmEvent = { event?: string; object?: { id?: string; metadata?: { organizationId?: string } } };
  type YmPayment = { id?: string; status?: string; paid?: boolean; amount?: { value?: string; currency?: string }; metadata?: { organizationId?: string; planId?: string; manualSubId?: string } };
  fastify.post("/billing/yoomoney/webhook", { config: { public: true } }, async (request, reply) => {
    const event = parse<YmEvent>(request.body);
    const paymentId = event?.object?.id;
    const orgHint = event?.object?.metadata?.organizationId;
    if (event?.event !== "payment.succeeded" || !paymentId || !orgHint) return reply.send({ received: true });

    // Platform credentials only: tenant-supplied credentials must never drive plan changes.
    const shopId = process.env["YOOMONEY_SHOP_ID"] ?? "";
    const secretKey = process.env["YOOMONEY_SECRET_KEY"] ?? "";
    if (!shopId || !secretKey) return reply.send({ received: true });

    let payment: YmPayment | null = null;
    try {
      const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}` },
      });
      if (res.ok) payment = (await res.json()) as YmPayment;
    } catch { /* gateway unreachable: treat as unconfirmed */ }
    if (!payment || payment.status !== "succeeded" || payment.paid !== true) return reply.send({ received: true });

    const orgId = payment.metadata?.organizationId;
    const { planId, manualSubId } = payment.metadata ?? {};
    if (!orgId || orgId !== orgHint) return reply.send({ received: true });
    if (manualSubId) {
      const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
      if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
    } else {
      const minor = Math.round(Number(payment.amount?.value ?? "NaN") * 100);
      if (isBillableTier(planId) && isPaidAmountSufficient(planId, payment.amount?.currency ?? "", minor)) {
        await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: payment.amount?.currency }, "yoomoney payment not activated: unknown plan, currency or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });
};
