import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import { getStripe } from "../lib/stripe.js";
import type { PlanTier } from "@prisma/client";

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

      if (event.type === "checkout.session.completed") {
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
      }

      return reply.status(200).send({ received: true });
    }
  );
};
