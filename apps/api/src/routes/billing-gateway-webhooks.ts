import type { FastifyPluginAsync } from "fastify";
import type { PlanTier } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { isBillableTier, isPaidAmountSufficient } from "../lib/billing/catalog.js";
import { activatePlan, isUnknownOrgError } from "../lib/billing/activation.js";

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
  type RzpEvent = { event?: string; payload?: { payment?: { entity?: { id?: string; amount?: number; currency?: string; notes?: { organizationId?: string; planId?: string; manualSubId?: string } } } } };
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
      // Manual subscriptions are activated only by superAdmin approval, never by a webhook.
      const { planId } = entity.notes ?? {};
      if (isBillableTier(planId) && isPaidAmountSufficient(planId, entity.currency ?? "", entity.amount ?? NaN)) {
        if (!entity.id) {
          fastify.log.warn({ orgId, planId }, "razorpay payment not activated: missing payment id");
        } else {
          try {
            await activatePlan(fastify.prisma, {
              organizationId: orgId, planTier: planId as PlanTier, source: "razorpay", gateway: "razorpay",
              referenceId: `razorpay:${entity.id}`, gatewayTransactionId: entity.id,
              amountMinor: entity.amount, currency: entity.currency,
            });
          } catch (err) {
            if (!isUnknownOrgError(err)) throw err;
            fastify.log.warn({ orgId, planId }, "razorpay payment for an organization that no longer exists");
          }
        }
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: entity.currency, amount: entity.amount }, "razorpay payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });

  // ── Paystack ────────────────────────────────────────────────────────────
  type PsEvent = { event?: string; data?: { reference?: string; amount?: number; currency?: string; metadata?: { organizationId?: string; planId?: string } } };
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
      const { planId } = event.data.metadata ?? {};
      if (isBillableTier(planId) && isPaidAmountSufficient(planId, event.data.currency ?? "", event.data.amount ?? NaN)) {
        const reference = event.data.reference;
        if (!reference) {
          fastify.log.warn({ orgId, planId }, "paystack payment not activated: missing reference");
        } else {
          try {
            await activatePlan(fastify.prisma, {
              organizationId: orgId, planTier: planId as PlanTier, source: "paystack", gateway: "paystack",
              referenceId: `paystack:${reference}`, gatewayTransactionId: reference,
              amountMinor: event.data.amount, currency: event.data.currency,
            });
          } catch (err) {
            if (!isUnknownOrgError(err)) throw err;
            fastify.log.warn({ orgId, planId }, "paystack payment for an organization that no longer exists");
          }
        }
      } else if (planId) {
        fastify.log.warn({ orgId, planId, currency: event.data.currency, amount: event.data.amount }, "paystack payment not activated: unknown plan or insufficient amount (manual review)");
      }
    }
    return reply.send({ received: true });
  });

  // ── YooMoney / YooKassa (notifications are unsigned: confirm with the gateway) ──
  type YmEvent = { event?: string; object?: { id?: string; metadata?: { organizationId?: string } } };
  type YmPayment = { id?: string; status?: string; paid?: boolean; amount?: { value?: string; currency?: string }; metadata?: { organizationId?: string; planId?: string } };
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
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) payment = (await res.json()) as YmPayment;
    } catch { /* gateway unreachable or timed out: treated as unconfirmed below */ }
    if (!payment || payment.status !== "succeeded" || payment.paid !== true) {
      fastify.log.warn({ paymentId, orgId: orgHint }, "yoomoney payment not confirmed by gateway (unreachable, non-ok or unpaid)");
      return reply.send({ received: true });
    }

    const orgId = payment.metadata?.organizationId;
    const { planId } = payment.metadata ?? {};
    if (!orgId || orgId !== orgHint) return reply.send({ received: true });
    const minor = Math.round(Number(payment.amount?.value ?? "NaN") * 100);
    if (isBillableTier(planId) && isPaidAmountSufficient(planId, payment.amount?.currency ?? "", minor)) {
      if (!payment.id) {
        fastify.log.warn({ orgId, planId }, "yoomoney payment not activated: missing payment id");
      } else {
        try {
          await activatePlan(fastify.prisma, {
            organizationId: orgId, planTier: planId as PlanTier, source: "yoomoney", gateway: "yoomoney",
            referenceId: `yoomoney:${payment.id}`, gatewayTransactionId: payment.id,
            amountMinor: minor, currency: payment.amount?.currency,
          });
        } catch (err) {
          if (!isUnknownOrgError(err)) throw err;
          fastify.log.warn({ orgId, planId }, "yoomoney payment for an organization that no longer exists");
        }
      }
    } else if (planId) {
      fastify.log.warn({ orgId, planId, currency: payment.amount?.currency }, "yoomoney payment not activated: unknown plan, currency or insufficient amount (manual review)");
    }
    return reply.send({ received: true });
  });
};
