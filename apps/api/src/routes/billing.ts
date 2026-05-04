import type { FastifyPluginAsync } from "fastify";
import { getStripe, PLAN_PRICE_IDS, PLAN_LIMITS } from "../lib/stripe.js";

export const billingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/billing/usage", async (request) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true },
    });
    const tier = (org?.planTier ?? "starter") as string;
    const limits = PLAN_LIMITS[tier] ?? PLAN_LIMITS["starter"];

    const [contactCount, messageCount] = await Promise.all([
      fastify.prisma.contact.count({ where: { organizationId } }),
      fastify.prisma.message.count({ where: { organizationId } }),
    ]);

    return {
      data: {
        plan: tier,
        usage: { contacts: contactCount, messages: messageCount },
        limits: {
          contacts: limits.contacts === Infinity ? null : limits.contacts,
          messages: limits.messages === Infinity ? null : limits.messages,
        },
      },
    };
  });

  fastify.post<{ Body: { planTier: PlanTier; successUrl: string; cancelUrl: string } }>(
    "/billing/checkout",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { planTier, successUrl, cancelUrl } = request.body;
      const priceId = PLAN_PRICE_IDS[planTier];
      if (!priceId) return reply.status(400).send({ error: "invalid_plan" });

      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { organizationId, planTier },
      });

      return { data: { url: session.url } };
    }
  );

  fastify.post("/billing/portal", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = org?.settings as Record<string, string> | null;
    const customerId = settings?.["stripeCustomerId"];
    if (!customerId) return reply.status(404).send({ error: "no_billing_account" });

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.headers.origin ?? ""}/settings/billing`,
    });

    return { data: { url: session.url } };
  });

};
