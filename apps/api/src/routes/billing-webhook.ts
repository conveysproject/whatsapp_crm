import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { getStripe } from "../lib/stripe.js";
import type { PlanTier } from "@prisma/client";
import { activatePlan, isUnknownOrgError } from "../lib/billing/activation.js";
import { isBillingV2Enabled, graceDays } from "../lib/billing/flags.js";
import { tierFromPriceId } from "../lib/billing/stripe-customer.js";
import { notifyPaymentFailed } from "../lib/billing/payment-failed-email.js";

export const billingWebhookRouter: FastifyPluginAsync = async (fastify) => {
  // Capture raw body as Buffer so Stripe can verify the HMAC signature.
  // Fastify parses JSON by default; re-serializing with JSON.stringify produces
  // different bytes and breaks Stripe's constructEvent signature check.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body)
  );

  fastify.post<{ Body: Buffer }>(
    "/billing/webhook",
    { config: { public: true } },
    async (request, reply) => {
      const sig = request.headers["stripe-signature"];
      const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
      if (!webhookSecret) {
        fastify.log.error("STRIPE_WEBHOOK_SECRET is not configured");
        return reply.status(500).send({ error: "server_configuration_error" });
      }

      let event: Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(
          request.body as Buffer,
          sig as string,
          webhookSecret
        );
      } catch {
        return reply.status(400).send({ error: "invalid_signature" });
      }

      const v2 = isBillingV2Enabled();
      const obj = event.data.object as unknown as Record<string, unknown>;
      const customerOf = (c: unknown): string | null =>
        typeof c === "string" ? c : (c as { id?: string } | null)?.id ?? null;
      const findOrg = async (customerId: string | null) =>
        customerId
          ? fastify.prisma.organization.findFirst({
              where: { stripeId: customerId },
              select: { id: true, planTier: true, billingStatus: true },
            })
          : null;
      type SubShape = { id: string; cancel_at_period_end?: boolean; items?: { data: { price?: { id?: string } }[] } };

      try {
        if (event.type === "checkout.session.completed" && v2) {
          const session = event.data.object;
          const orgId = session.metadata?.["organizationId"];
          const customerId = customerOf(session.customer);
          if (orgId && customerId) {
            await fastify.prisma.organization.updateMany({
              where: { id: orgId, stripeId: null },
              data: { stripeId: customerId },
            });
          }
        } else if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          const { organizationId, planTier } = session.metadata ?? {};
          if (organizationId && planTier) {
            const org = await fastify.prisma.organization.findUnique({
              where: { id: organizationId },
              select: { settings: true },
            });
            const existing = (org?.settings as Record<string, unknown>) ?? {};
            const customerId =
              typeof session.customer === "string"
                ? session.customer
                : (session.customer as { id?: string } | null)?.id ?? null;
            await fastify.prisma.organization.update({
              where: { id: organizationId },
              data: {
                planTier: planTier as PlanTier,
                settings: { ...existing, stripeCustomerId: customerId },
              },
            });
          }
        } else if (v2 && event.type === "invoice.payment_succeeded") {
          const customerId = customerOf(obj["customer"]);
          const org = await findOrg(customerId);
          if (!org || !customerId) {
            fastify.log.warn("stripe invoice for unknown customer");
            return reply.status(200).send({ received: true });
          }
          const billingReason = obj["billing_reason"];
          const isSubscriptionInvoice = typeof billingReason === "string" && billingReason.startsWith("subscription");
          const amountMinor = typeof obj["amount_paid"] === "number" ? obj["amount_paid"] : undefined;
          const currency = typeof obj["currency"] === "string" ? obj["currency"] : undefined;
          const base = {
            organizationId: org.id,
            source: "stripe" as const,
            gateway: "stripe" as const,
            referenceId: `stripe:invoice:${String(obj["id"])}`,
            gatewayTransactionId: String(obj["id"]),
            ...(amountMinor !== undefined ? { amountMinor } : {}),
            ...(currency !== undefined ? { currency } : {}),
          };
          if (!isSubscriptionInvoice) {
            // One-off / non-subscription invoice: record the money only; never touch plan or billing state.
            await activatePlan(fastify.prisma, { ...base, planTier: org.planTier as PlanTier, ledgerOnly: true });
          } else {
            const subs = await getStripe().subscriptions.list({ customer: customerId, status: "active", limit: 10 });
            const multiple = subs.data.length > 1;
            if (multiple) {
              fastify.log.warn({ organizationId: org.id, activeSubscriptions: subs.data.length }, "stripe customer has multiple active subscriptions; keeping tier");
            }
            const sub = multiple ? undefined : (subs.data[0] as unknown as SubShape | undefined);
            const tier = tierFromPriceId(sub?.items?.data[0]?.price?.id) ?? org.planTier;
            await activatePlan(fastify.prisma, {
              ...base,
              planTier: tier as PlanTier,
              ...(sub?.id !== undefined ? { stripeSubscriptionId: sub.id } : {}),
              ...(sub?.cancel_at_period_end !== undefined ? { cancelAtPeriodEnd: sub.cancel_at_period_end } : {}),
              // A late/retried invoice after cancellation keeps the money record but must not resurrect the plan.
              ...(subs.data.length === 0 && org.billingStatus === "cancelled" ? { ledgerOnly: true } : {}),
            });
          }
        } else if (v2 && event.type === "invoice.payment_failed") {
          const org = await findOrg(customerOf(obj["customer"]));
          if (!org) {
            fastify.log.warn("stripe payment_failed for unknown customer");
          } else if (
            // Stripe does not guarantee event order: a stale failure may arrive after the invoice was paid.
            // If retrieve throws, the error propagates (500) and Stripe retries.
            (await getStripe().invoices.retrieve(String(obj["id"]))).status === "paid"
          ) {
            fastify.log.info({ invoiceId: String(obj["id"]) }, "stale payment_failed for an already paid invoice; skipping");
          } else {
            const graceEndsAt = new Date(Date.now() + graceDays() * 86_400_000);
            const res = await fastify.prisma.organization.updateMany({
              where: { id: org.id, billingStatus: { notIn: ["past_due", "cancelled"] } },
              data: { billingStatus: "past_due", billingGraceEndsAt: graceEndsAt },
            });
            if (res.count === 1) await notifyPaymentFailed(fastify.prisma, org.id, graceEndsAt);
          }
        } else if (v2 && event.type === "customer.subscription.updated") {
          const org = await findOrg(customerOf(obj["customer"]));
          if (!org) {
            fastify.log.warn("stripe subscription update for unknown customer");
          } else {
            await fastify.prisma.organization.update({
              where: { id: org.id },
              data: { planCancelAtPeriodEnd: (obj["cancel_at_period_end"] as boolean | undefined) ?? false },
            });
          }
        } else if (v2 && event.type === "customer.subscription.deleted") {
          const customerId = customerOf(obj["customer"]);
          const org = await findOrg(customerId);
          if (!org || !customerId) {
            fastify.log.warn("stripe subscription deletion for unknown customer");
          } else {
            const active = await getStripe().subscriptions.list({ customer: customerId, status: "active", limit: 1 });
            if (active.data.length === 0) {
              await fastify.prisma.organization.update({
                where: { id: org.id },
                data: { planTier: "starter", billingStatus: "cancelled", billingGraceEndsAt: null, planCancelAtPeriodEnd: false },
              });
            }
          }
        }
      } catch (err) {
        if (!v2 || !isUnknownOrgError(err)) throw err;
        fastify.log.warn({ eventId: event.id }, "stripe event for unknown organization");
      }

      return reply.status(200).send({ received: true });
    }
  );
};
