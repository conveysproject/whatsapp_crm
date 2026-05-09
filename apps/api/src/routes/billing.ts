import type { FastifyPluginAsync } from "fastify";
import type { PlanTier } from "@WBMSG/shared";
import type { Prisma } from "@prisma/client";
import { getStripe, PLAN_PRICE_IDS, PLAN_LIMITS } from "../lib/stripe.js";
import Razorpay from "razorpay";

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

  // ── Razorpay ─────────────────────────────────────────────────────────────
  fastify.post<{ Body: { planId: string; amount: number } }>(
    "/billing/razorpay/create-order",
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

  fastify.post("/billing/razorpay/webhook", async (request, reply) => {
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
      const { organizationId } = event.payload.payment.entity.notes;
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: {
          settings: ({
            planId: event.payload.payment.entity.notes.planId,
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

  fastify.post("/billing/paystack/webhook", async (request, reply) => {
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
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId,
          planTier: planId as PlanTier,
          status: "active",
          charges: 0,
          chargesFrequency: "one_time",
          gateway: "other",
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
