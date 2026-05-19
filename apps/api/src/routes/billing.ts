import type { FastifyPluginAsync } from "fastify";
import type { PlanTier } from "@WBMSG/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getStripe, PLAN_PRICE_IDS, PLAN_LIMITS, ZERO_DECIMAL_CURRENCIES } from "../lib/stripe.js";
import { checkPlanLimit, isFeatureEnabled } from "../lib/plan-limits.js";
import Razorpay from "razorpay";

// GAP-S60: load gateway credentials from VendorSettings, fallback to env vars
async function getGatewayCredentials(prisma: PrismaClient, organizationId: string, gateway: string): Promise<Record<string, string>> {
  const keys = [
    `${gateway}_key_id`, `${gateway}_key_secret`, `${gateway}_webhook_secret`,
    `${gateway}_publishable_key`, `${gateway}_secret_key`, `use_test_${gateway}`,
    `${gateway}_wallet`, `${gateway}_merchant_id`, `${gateway}_api_key`,
  ];
  const settings = await prisma.vendorSetting.findMany({ where: { organizationId, key: { in: keys } }, select: { key: true, value: true } });
  return Object.fromEntries(settings.filter((s) => s.value).map((s) => [s.key, s.value!]));
}

// GAP-S56: planSelectorId may arrive as "{planTier}___monthly" or "{planTier}___yearly"
function parsePlanSelector(selector: string): { planTier: PlanTier; interval: "monthly" | "yearly" } {
  const parts = selector.split("___");
  const tier = (parts[0] ?? selector) as PlanTier;
  const interval = parts[1] === "yearly" ? "yearly" : "monthly";
  return { planTier: tier, interval };
}

// GAP-S31: calculate subscription end date; lifetime cap at year 9999
function calcEndsAt(interval: "monthly" | "yearly", proratedDays: number): Date {
  const now = new Date();
  const baseDays = interval === "yearly" ? 365 : 30;
  const endsAt = new Date(now.getTime() + (baseDays + proratedDays) * 86_400_000);
  const cap = new Date("9999-12-31T23:59:59Z");
  return endsAt > cap ? cap : endsAt;
}

// GAP-S53: activate a manual subscription and cancel all previously active ones
async function activateManualSubscription(prisma: PrismaClient, organizationId: string, manualSubId: string, planTier: PlanTier): Promise<void> {
  await prisma.$transaction([
    prisma.manualSubscription.updateMany({ where: { organizationId, status: "active" }, data: { status: "cancelled" } }),
    prisma.manualSubscription.update({ where: { id: manualSubId }, data: { status: "active" } }),
    prisma.organization.update({ where: { id: organizationId }, data: { planTier } }),
  ]);
}

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
  fastify.post<{ Body: { planTier: PlanTier | string } }>("/billing/switch-plan", async (request, reply) => {
    const { organizationId } = request.auth;
    // GAP-S56: support planSelectorId "___" format
    const { planTier } = parsePlanSelector(request.body.planTier as string);
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

  fastify.post<{ Body: { planTier: PlanTier | string; successUrl: string; cancelUrl: string } }>(
    "/billing/checkout",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { successUrl, cancelUrl } = request.body;
      // GAP-S56: support "{planTier}___monthly" / "{planTier}___yearly" selectors
      const { planTier } = parsePlanSelector(request.body.planTier as string);
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
      // GAP-S60: DB credentials take precedence over env vars
      const creds = await getGatewayCredentials(fastify.prisma, request.auth.organizationId, "razorpay");
      const rzp = new Razorpay({
        key_id: creds["razorpay_key_id"] ?? process.env["RAZORPAY_KEY_ID"] ?? "",
        key_secret: creds["razorpay_key_secret"] ?? process.env["RAZORPAY_KEY_SECRET"] ?? "",
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
    // GAP-S60: try DB secret first, fallback to env
    const event = request.body as { event: string; payload: { payment: { entity: { notes: { organizationId?: string; planId?: string; manualSubId?: string } } } } };
    const orgId = event.payload?.payment?.entity?.notes?.organizationId;
    let webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
    if (orgId) {
      const creds = await getGatewayCredentials(fastify.prisma, orgId, "razorpay");
      webhookSecret = creds["razorpay_webhook_secret"] ?? webhookSecret;
    }
    const expected = createHmac("sha256", webhookSecret).update(body).digest("hex");
    if (signature && signature !== expected) return reply.status(400).send({ error: "Invalid signature" });
    // GAP-S61: only process payment.captured
    if (event.event === "payment.captured" && orgId) {
      const { planId, manualSubId } = event.payload.payment.entity.notes;
      if (manualSubId) {
        // Activate manual subscription (GAP-S53)
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (planId) {
        const org = await fastify.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
        const existing = (org?.settings as Record<string, unknown>) ?? {};
        await fastify.prisma.organization.update({
          where: { id: orgId },
          data: {
            planTier: planId as PlanTier,
            settings: ({ ...existing, razorpayPlanId: planId, activatedAt: new Date().toISOString() } as Record<string, unknown>) as Prisma.InputJsonValue,
          },
        });
      }
    }
    return reply.send({ received: true });
  });

  // ── Paystack ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { reference: string } }>("/billing/paystack/verify", async (request, reply) => {
    const { organizationId } = request.auth;
    // GAP-S60: DB credentials
    const creds = await getGatewayCredentials(fastify.prisma, organizationId, "paystack");
    const secretKey = creds["paystack_secret_key"] ?? process.env["PAYSTACK_SECRET_KEY"] ?? "";
    const res = await fetch(`https://api.paystack.co/transaction/verify/${request.body.reference}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const json = await res.json() as { status: boolean; data: { status: string } };
    if (!json.status || json.data.status !== "success") return reply.status(400).send({ error: "Payment not verified" });
    return reply.send({ data: { verified: true } });
  });

  fastify.post("/billing/paystack/webhook", { config: { public: true } }, async (request, reply) => {
    const hash = request.headers["x-paystack-signature"] as string;
    const { createHmac } = await import("crypto");
    // GAP-S61: Paystack uses charge.success event with HMAC-SHA512 via X-Paystack-Signature
    const event = request.body as { event: string; data: { metadata?: { organizationId?: string; planId?: string; manualSubId?: string }; customer?: { metadata?: Record<string, string> } } };
    const orgId = event.data?.metadata?.organizationId;
    let secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "";
    if (orgId) {
      const creds = await getGatewayCredentials(fastify.prisma, orgId, "paystack");
      secretKey = creds["paystack_secret_key"] ?? secretKey;
    }
    const expected = createHmac("sha512", secretKey).update(JSON.stringify(request.body)).digest("hex");
    if (hash !== expected) return reply.status(400).send({ error: "Invalid signature" });
    if (event.event === "charge.success" && orgId) {
      const { planId, manualSubId } = event.data.metadata ?? {};
      if (manualSubId) {
        const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
        if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
      } else if (planId) {
        await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
      }
    }
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
    // GAP-S62: PhonePe requires "O-Bearer" prefix (not standard "Bearer")
    const res = await fetch(
      `https://api.phonepe.com/apis/hermes/pg/v1/status/${merchantId}/${request.body.transactionId}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${apiKey}`,
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": merchantId,
        },
      }
    );
    const json = await res.json() as { success: boolean; code: string };
    return reply.send({ data: { success: json.success, code: json.code } });
  });

  // ── YooMoney ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { amount: number; planId: string; currency?: string; description?: string } }>(
    "/billing/yoomoney/checkout",
    async (request, reply) => {
      const { organizationId } = request.auth;
      // GAP-S60: DB credentials first
      const creds = await getGatewayCredentials(fastify.prisma, organizationId, "yoomoney");
      const shopId = creds["yoomoney_shop_id"] ?? process.env["YOOMONEY_SHOP_ID"] ?? "";
      const secretKey = creds["yoomoney_secret_key"] ?? process.env["YOOMONEY_SECRET_KEY"] ?? "";
      const isTest = creds["use_test_yoomoney"] === "true" || !shopId;

      // Quickpay fallback for test mode (no shop credentials needed)
      if (isTest) {
        const receiver = creds["yoomoney_wallet"] ?? process.env["YOOMONEY_WALLET"] ?? "";
        const label = `${organizationId}:${request.body.planId}`;
        const quickpayCurrency = request.body.currency ?? "RUB";
        const quickpayIsZero = ZERO_DECIMAL_CURRENCIES.has(quickpayCurrency.toUpperCase());
        const quickpaySum = quickpayIsZero
          ? Math.round(request.body.amount).toString()
          : (request.body.amount / 100).toFixed(2);
        const url = `https://yoomoney.ru/quickpay/confirm?receiver=${receiver}&quickpay-form=shop&targets=Subscription&paymentType=AC&sum=${quickpaySum}&label=${encodeURIComponent(label)}`;
        return reply.send({ data: { checkoutUrl: url, mode: "test" } });
      }

      // GAP-S33/S73: live mode — YooKassa API with VAT receipt items
      const currency = request.body.currency ?? "RUB";
      // GAP-S73: zero-decimal currencies (JPY, KRW, etc.) must not be divided by 100
      const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
      const amountValue = isZeroDecimal
        ? Math.round(request.body.amount).toString()
        : (request.body.amount / 100).toFixed(2);
      const description = request.body.description ?? `TrustCRM Subscription — ${request.body.planId}`;
      const label = `${organizationId}:${request.body.planId}`;
      const returnUrl = `${(process.env["WEB_PUBLIC_URL"] ?? process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/settings/billing?status=success`;

      const paymentBody = {
        amount: { value: amountValue, currency },
        description,
        metadata: { organizationId, planId: request.body.planId, label },
        confirmation: { type: "redirect", return_url: returnUrl },
        // GAP-S33: receipt with VAT for Russian market
        receipt: {
          items: [{
            description,
            quantity: "1.00",
            amount: { value: amountValue, currency },
            vat_code: 1, // VAT-free (0%)
            payment_subject: "service",
            payment_mode: "full_payment",
          }],
        },
        capture: true,
      };

      const res = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotence-Key": label,
        },
        body: JSON.stringify(paymentBody),
      });
      if (!res.ok) {
        const err = await res.json() as unknown;
        fastify.log.error({ err }, "YooKassa payment creation failed");
        return reply.status(502).send({ error: { code: "YOOKASSA_ERROR", message: "Payment creation failed" } });
      }
      const json = await res.json() as { id: string; status: string; confirmation: { confirmation_url: string } };
      return reply.send({ data: { checkoutUrl: json.confirmation.confirmation_url, paymentId: json.id, mode: "live" } });
    }
  );

  // GAP-S61: YooMoney payment.succeeded webhook
  fastify.post("/billing/yoomoney/webhook", { config: { public: true } }, async (request, reply) => {
    const event = request.body as { event?: string; object?: { metadata?: { organizationId?: string; planId?: string; manualSubId?: string } } };
    if (event.event === "payment.succeeded") {
      const orgId = event.object?.metadata?.organizationId;
      const planId = event.object?.metadata?.planId;
      const manualSubId = event.object?.metadata?.manualSubId;
      if (orgId) {
        if (manualSubId) {
          const sub = await fastify.prisma.manualSubscription.findFirst({ where: { id: manualSubId, organizationId: orgId } });
          if (sub) await activateManualSubscription(fastify.prisma, orgId, sub.id, sub.planTier as PlanTier);
        } else if (planId) {
          await fastify.prisma.organization.update({ where: { id: orgId }, data: { planTier: planId as PlanTier } });
        }
      }
    }
    return reply.send({ received: true });
  });

  // ── Manual payment proof ─────────────────────────────────────────────────
  fastify.post<{ Body: { planId: string | undefined; planSelector?: string; proofUrl: string; transactionRef: string; interval?: "monthly" | "yearly" } }>(
    "/billing/manual/submit-proof",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { proofUrl, transactionRef } = request.body;
      // GAP-S56: accept planSelector "{tier}___interval" or plain planId
      const { planTier, interval } = request.body.planSelector
        ? parsePlanSelector(request.body.planSelector)
        : { planTier: request.body.planId as PlanTier, interval: (request.body.interval ?? "monthly") as "monthly" | "yearly" };

      if (transactionRef) {
        const duplicate = await fastify.prisma.manualSubscription.findFirst({
          where: { organizationId, transactionRef },
        });
        if (duplicate) {
          return reply.status(409).send({ error: { code: "DUPLICATE_TRANSACTION", message: "This transaction reference has already been submitted" } });
        }
      }

      // GAP-S31: delete any lingering "initiated" subs before creating a new one
      await fastify.prisma.manualSubscription.deleteMany({ where: { organizationId, status: "initiated" } });

      // GAP-S31: proration — find days remaining on current active sub, roll into new period
      const activeSub = await fastify.prisma.manualSubscription.findFirst({
        where: { organizationId, status: "active" },
        select: { endsAt: true },
      });
      const proratedDays = activeSub?.endsAt
        ? Math.max(0, Math.round((activeSub.endsAt.getTime() - Date.now()) / 86_400_000))
        : 0;
      const endsAt = calcEndsAt(interval, proratedDays);

      // GAP-S53: create with "pending" status (awaiting admin approval)
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId,
          planTier,
          status: "pending",
          charges: 0,
          chargesFrequency: interval === "yearly" ? "yearly" : "monthly",
          gateway: "other",
          transactionRef: transactionRef ?? null,
          endsAt,
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

  // GAP-S53: admin approve — activates subscription, cancels any existing active
  fastify.post<{ Params: { id: string } }>("/billing/manual/:id/approve", async (request, reply) => {
    if (request.auth.role !== "admin") return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Admin only" } });
    const sub = await fastify.prisma.manualSubscription.findFirst({
      where: { id: request.params.id, status: "pending" },
    });
    if (!sub) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Pending subscription not found" } });
    await activateManualSubscription(fastify.prisma, sub.organizationId, sub.id, sub.planTier as PlanTier);
    return reply.send({ data: { activated: true } });
  });

  // GAP-S53: admin reject — moves to cancelled
  fastify.post<{ Params: { id: string } }>("/billing/manual/:id/reject", async (request, reply) => {
    if (request.auth.role !== "admin") return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Admin only" } });
    const updated = await fastify.prisma.manualSubscription.updateMany({
      where: { id: request.params.id, status: { in: ["pending", "initiated"] } },
      data: { status: "cancelled" },
    });
    if (updated.count === 0) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Subscription not found" } });
    return reply.send({ data: { rejected: true } });
  });

  // ── Stripe webhook endpoint auto-creation (GAP-S72) ─────────────────────
  fastify.post("/billing/stripe/setup-webhook", async (request, reply) => {
    const { role } = request.auth;
    if (role !== "admin") return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Admin only" } });
    const apiUrl = process.env["API_PUBLIC_URL"] ?? process.env["RAILWAY_PUBLIC_DOMAIN"] ?? "";
    if (!apiUrl) return reply.status(400).send({ error: { code: "NO_API_URL", message: "API_PUBLIC_URL env var not set" } });
    const endpoint = await getStripe().webhookEndpoints.create({
      url: `${apiUrl.replace(/\/$/, "")}/v1/billing/stripe/webhook`,
      enabled_events: [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
        "customer.created",
        "payment_intent.succeeded",
      ],
    });
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId: request.auth.organizationId, key: "stripe_webhook_secret" } },
      create: { organizationId: request.auth.organizationId, key: "stripe_webhook_secret", value: endpoint.secret ?? "", dataType: "string" },
      update: { value: endpoint.secret ?? "" },
    });
    return reply.send({ data: { webhookId: endpoint.id, url: endpoint.url } });
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
