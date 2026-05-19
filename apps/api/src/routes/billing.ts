import type { FastifyPluginAsync } from "fastify";
import type { PlanTier } from "@WBMSG/shared";
import type { Prisma } from "@prisma/client";
import { getStripe, PLAN_PRICE_IDS, PLAN_LIMITS } from "../lib/stripe.js";
import { checkPlanLimit, isFeatureEnabled } from "../lib/plan-limits.js";
import Razorpay from "razorpay";

export const billingRouter: FastifyPluginAsync = async (fastify) => {
  // ── Plan catalogue ────────────────────────────────────────────────────────
  fastify.get("/billing/plans", async () => {
    return {
      data: [
        { tier: "starter", name: "Starter", priceInr: 999, priceUsd: 12, limits: PLAN_LIMITS["starter"] },
        { tier: "growth", name: "Growth", priceInr: 2999, priceUsd: 36, limits: PLAN_LIMITS["growth"] },
        { tier: "scale", name: "Scale", priceInr: 7999, priceUsd: 96, limits: PLAN_LIMITS["scale"] },
        { tier: "enterprise", name: "Enterprise", priceInr: null, priceUsd: null, limits: { contacts: null, messages: null } },
      ],
    };
  });

  // ── Current subscription ──────────────────────────────────────────────────
  fastify.get("/billing/subscriptions", async (request) => {
    const { organizationId } = request.auth;
    const [org, manualSub] = await Promise.all([
      fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: { planTier: true, settings: true } }),
      fastify.prisma.manualSubscription.findFirst({
        where: { organizationId, status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const settings = org?.settings as Record<string, string> | null;
    const stripeCustomerId = settings?.["stripeCustomerId"];

    let stripeSubscription: { id: string; status: string; currentPeriodEnd: string } | null = null;
    if (stripeCustomerId) {
      try {
        const subs = await getStripe().subscriptions.list({ customer: stripeCustomerId, status: "active", limit: 1 });
        const sub = subs.data[0];
        if (sub) {
          stripeSubscription = {
            id: sub.id,
            status: sub.status,
            currentPeriodEnd: new Date(sub.billing_cycle_anchor * 1000).toISOString(),
          };
        }
      } catch { /* Stripe not configured */ }
    }

    return {
      data: {
        planTier: org?.planTier ?? "starter",
        stripe: stripeSubscription,
        manual: manualSub
          ? {
              id: manualSub.id,
              status: manualSub.status,
              charges: manualSub.charges,
              chargesFrequency: manualSub.chargesFrequency,
              expiresAt: manualSub.endsAt,
            }
          : null,
      },
    };
  });

  // ── Cancel at period end (grace period) ─────────────────────────────────
  fastify.post("/billing/cancel", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = org?.settings as Record<string, string> | null;
    const stripeCustomerId = settings?.["stripeCustomerId"];
    if (!stripeCustomerId) return reply.status(400).send({ error: { code: "NO_BILLING_ACCOUNT", message: "No Stripe customer found" } });
    const subs = await getStripe().subscriptions.list({ customer: stripeCustomerId, status: "active", limit: 1 });
    const sub = subs.data[0];
    if (!sub) return reply.status(400).send({ error: { code: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription" } });
    const updated = await getStripe().subscriptions.update(sub.id, { cancel_at_period_end: true });
    const periodEnd = (updated as unknown as { current_period_end: number }).current_period_end;
    return reply.send({ data: { cancelled: true, accessUntil: new Date(periodEnd * 1000) } });
  });

  // ── Cancel immediately ────────────────────────────────────────────────────
  fastify.post("/billing/cancel-now", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = org?.settings as Record<string, string> | null;
    const stripeCustomerId = settings?.["stripeCustomerId"];
    if (!stripeCustomerId) return reply.status(400).send({ error: { code: "NO_BILLING_ACCOUNT", message: "No Stripe customer found" } });
    const subs = await getStripe().subscriptions.list({ customer: stripeCustomerId, status: "active", limit: 1 });
    const sub = subs.data[0];
    if (!sub) return reply.status(400).send({ error: { code: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription" } });
    await getStripe().subscriptions.cancel(sub.id);
    await fastify.prisma.organization.update({ where: { id: organizationId }, data: { planTier: "starter" } });
    return reply.send({ data: { cancelled: true } });
  });

  // ── Switch plan via Stripe ────────────────────────────────────────────────
  fastify.post<{ Body: { planTier: PlanTier } }>("/billing/switch-plan", async (request, reply) => {
    const { organizationId } = request.auth;
    const { planTier } = request.body;
    const priceId = PLAN_PRICE_IDS[planTier];
    if (!priceId) return reply.status(400).send({ error: { code: "INVALID_PLAN", message: "Unknown plan tier" } });

    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = org?.settings as Record<string, string> | null;
    const stripeCustomerId = settings?.["stripeCustomerId"];
    if (!stripeCustomerId) return reply.status(400).send({ error: { code: "NO_BILLING_ACCOUNT", message: "No Stripe customer found" } });

    const subs = await getStripe().subscriptions.list({ customer: stripeCustomerId, status: "active", limit: 1 });
    const sub = subs.data[0];
    if (!sub) return reply.status(400).send({ error: { code: "NO_ACTIVE_SUBSCRIPTION", message: "No active subscription to switch" } });

    await getStripe().subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0]?.id, price: priceId }],
      proration_behavior: "always_invoice",
      metadata: { planTier },
    });
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: { planTier },
    });
    return { data: { success: true, planTier } };
  });

  // ── Transaction history ───────────────────────────────────────────────────
  fastify.get<{ Querystring: { page?: string } }>("/billing/transactions", async (request) => {
    const { organizationId } = request.auth;
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const pageSize = 20;
    const transactions = await fastify.prisma.transaction.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { data: transactions, page, pageSize };
  });

  fastify.get("/billing/usage", async (request) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true },
    });
    const tier = (org?.planTier ?? "starter") as string;

    const [contacts, campaigns, chatbots, flows, customFields, teamMembers, aiChatBot, apiAccess] = await Promise.all([
      checkPlanLimit(fastify.prisma, organizationId, "contacts"),
      checkPlanLimit(fastify.prisma, organizationId, "campaigns"),
      checkPlanLimit(fastify.prisma, organizationId, "chatbots"),
      checkPlanLimit(fastify.prisma, organizationId, "flows"),
      checkPlanLimit(fastify.prisma, organizationId, "custom_fields"),
      checkPlanLimit(fastify.prisma, organizationId, "team_members"),
      isFeatureEnabled(fastify.prisma, organizationId, "ai_chat_bot"),
      isFeatureEnabled(fastify.prisma, organizationId, "api_access"),
    ]);

    const unavailable: string[] = [];
    if (!contacts.allowed) unavailable.push("contacts");
    if (!campaigns.allowed) unavailable.push("campaigns");
    if (!chatbots.allowed) unavailable.push("chatbots");
    if (!flows.allowed) unavailable.push("flows");
    if (!customFields.allowed) unavailable.push("custom_fields");
    if (!teamMembers.allowed) unavailable.push("team_members");

    return {
      data: {
        plan: tier,
        unavailableFeatures: unavailable,
        gates: {
          contacts: { current: contacts.current, limit: contacts.limit === -1 ? null : contacts.limit, allowed: contacts.allowed },
          campaigns: { current: campaigns.current, limit: campaigns.limit === -1 ? null : campaigns.limit, allowed: campaigns.allowed },
          chatbots: { current: chatbots.current, limit: chatbots.limit === -1 ? null : chatbots.limit, allowed: chatbots.allowed },
          flows: { current: flows.current, limit: flows.limit === -1 ? null : flows.limit, allowed: flows.allowed },
          custom_fields: { current: customFields.current, limit: customFields.limit === -1 ? null : customFields.limit, allowed: customFields.allowed },
          team_members: { current: teamMembers.current, limit: teamMembers.limit === -1 ? null : teamMembers.limit, allowed: teamMembers.allowed },
          ai_chat_bot: { enabled: aiChatBot },
          api_access: { enabled: apiAccess },
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

  // ── Razorpay ─────────────────────────────────────────────────────────────
  fastify.post<{ Body: { planId: string; amount: number } }>(
    "/billing/razorpay/create-order",
    { config: { public: false } },
    async (request, reply) => {
      const rzp = new Razorpay({
        key_id: process.env["RAZORPAY_KEY_ID"] ?? "",
        key_secret: process.env["RAZORPAY_KEY_SECRET"] ?? "",
      });
      const order = await rzp.orders.create({
        amount: request.body.amount,
        currency: "INR",
        notes: { planId: request.body.planId, organizationId: request.auth.organizationId },
      });
      return reply.send({ data: { orderId: order.id, amount: order.amount, currency: order.currency } });
    }
  );

  fastify.post("/billing/razorpay/webhook", { config: { public: true } }, async (request, reply) => {
    const signature = request.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(request.body);
    const { createHmac } = await import("crypto");
    const expected = createHmac("sha256", process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "").update(body).digest("hex");
    if (signature !== expected) return reply.status(400).send({ error: "Invalid signature" });
    const event = request.body as {
      event: string;
      payload: { payment: { entity: { notes: { organizationId: string; planId: string } } } };
    };
    if (event.event === "payment.captured") {
      const { organizationId, planId } = event.payload.payment.entity.notes;
      const org = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });
      const existing = (org?.settings as Record<string, unknown>) ?? {};
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: {
          planTier: planId as PlanTier,
          settings: ({
            ...existing,
            razorpayPlanId: planId,
            activatedAt: new Date().toISOString(),
          } as Record<string, unknown>) as Prisma.InputJsonValue,
        },
      });
    }
    return reply.send({ received: true });
  });

  // ── Paystack ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { reference: string } }>("/billing/paystack/verify", async (request, reply) => {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${request.body.reference}`, {
      headers: { Authorization: `Bearer ${process.env["PAYSTACK_SECRET_KEY"] ?? ""}` },
    });
    const json = await res.json() as { status: boolean; data: { status: string } };
    if (!json.status || json.data.status !== "success") return reply.status(400).send({ error: "Payment not verified" });
    return reply.send({ data: { verified: true } });
  });

  fastify.post("/billing/paystack/webhook", { config: { public: true } }, async (request, reply) => {
    const hash = request.headers["x-paystack-signature"] as string;
    const { createHmac } = await import("crypto");
    const expected = createHmac("sha512", process.env["PAYSTACK_SECRET_KEY"] ?? "")
      .update(JSON.stringify(request.body))
      .digest("hex");
    if (hash !== expected) return reply.status(400).send({ error: "Invalid signature" });
    return reply.send({ received: true });
  });

  // ── PhonePe ───────────────────────────────────────────────────────────────
  fastify.post<{ Body: { transactionId: string } }>("/billing/phonepe/capture", async (request, reply) => {
    const merchantId = process.env["PHONEPE_MERCHANT_ID"] ?? "";
    const apiKey = process.env["PHONEPE_API_KEY"] ?? "";
    const { createHash } = await import("crypto");
    const checksum =
      createHash("sha256")
        .update(`/pg/v1/status/${merchantId}/${request.body.transactionId}${apiKey}`)
        .digest("hex") + "###1";
    const res = await fetch(
      `https://api.phonepe.com/apis/hermes/pg/v1/status/${merchantId}/${request.body.transactionId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": merchantId,
        },
      }
    );
    const json = await res.json() as { success: boolean; code: string };
    return reply.send({ data: { success: json.success, code: json.code } });
  });

  // ── YooMoney ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { amount: number; planId: string } }>("/billing/yoomoney/checkout", async (request, reply) => {
    const receiver = process.env["YOOMONEY_WALLET"] ?? "";
    const label = `${request.auth.organizationId}:${request.body.planId}`;
    const url = `https://yoomoney.ru/quickpay/confirm?receiver=${receiver}&quickpay-form=shop&targets=Subscription&paymentType=AC&sum=${request.body.amount / 100}&label=${encodeURIComponent(label)}`;
    return reply.send({ data: { checkoutUrl: url } });
  });

  fastify.post("/billing/yoomoney/webhook", async (_request, reply) => {
    return reply.send({ received: true });
  });

  // ── Manual payment proof ─────────────────────────────────────────────────
  fastify.post<{ Body: { planId: string; proofUrl: string; transactionRef: string } }>(
    "/billing/manual/submit-proof",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { planId, proofUrl, transactionRef } = request.body;
      if (transactionRef) {
        const duplicate = await fastify.prisma.manualSubscription.findFirst({
          where: { organizationId, transactionRef },
        });
        if (duplicate) {
          return reply.status(409).send({ error: { code: "DUPLICATE_TRANSACTION", message: "This transaction reference has already been submitted" } });
        }
      }
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId,
          planTier: planId as PlanTier,
          status: "active",
          charges: 0,
          chargesFrequency: "one_time",
          gateway: "other",
          transactionRef: transactionRef ?? null,
          remarks: JSON.stringify({ proofUrl, transactionRef }),
        },
      });
      return reply.status(201).send({ data });
    }
  );

  fastify.delete("/billing/manual/cancel-request", async (request, reply) => {
    const { organizationId } = request.auth;
    await fastify.prisma.manualSubscription.updateMany({
      where: { organizationId, status: "active" },
      data: { status: "cancelled" },
    });
    return reply.send({ success: true });
  });

  // ── UPI QR code generation ────────────────────────────────────────────────
  fastify.get<{ Querystring: { amount?: string; planId?: string } }>("/billing/upi-qr", async (request, reply) => {
    const QRCode = await import("qrcode");
    const upiId = process.env.UPI_ID ?? "";
    const amount = ((parseInt(request.query.amount ?? "0", 10)) / 100).toFixed(2);
    const label = `TrustCRM ${request.query.planId ?? "Subscription"}`;
    const upiUrl = `upi://pay?pa=${upiId}&pn=TrustCRM&am=${amount}&cu=INR&tn=${encodeURIComponent(label)}`;
    const buffer = await QRCode.toBuffer(upiUrl, { type: "png", width: 300, margin: 2 });
    reply.header("Content-Type", "image/png");
    reply.header("Content-Disposition", "inline; filename=upi-qr.png");
    return reply.send(buffer);
  });

};
