import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import {
  getBusinessProfile,
  updateBusinessProfile,
  getDisplayName,
  updateDisplayName,
  syncPhoneNumbers,
  getHealthStatus,
  registerPhoneNumber,
  setTwoStepVerification,
} from "../lib/whatsapp.js";

// GAP-S65: 7 WhatsApp webhook event types to subscribe to
const WA_SUBSCRIBED_FIELDS = [
  "messages",
  "message_template_quality_update",
  "message_template_status_update",
  "account_update",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
] as const;

const WA_GRAPH = "https://graph.facebook.com/v22.0";

export const whatsappAccountRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/whatsapp-account/health-status", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await getHealthStatus(organizationId);
    return reply.send({ data });
  });

  fastify.get("/whatsapp-account/business-profile", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await getBusinessProfile(organizationId);
    return reply.send({ data });
  });

  fastify.put<{ Body: { about?: string; address?: string; email?: string; websites?: string[] } }>(
    "/whatsapp-account/business-profile",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const data = await updateBusinessProfile(organizationId, request.body);
      return reply.send({ data });
    }
  );

  fastify.get("/whatsapp-account/display-name", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await getDisplayName(organizationId);
    return reply.send({ data });
  });

  fastify.put<{ Body: { displayName: string } }>(
    "/whatsapp-account/display-name",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const data = await updateDisplayName(organizationId, request.body.displayName);
      return reply.send({ data });
    }
  );

  fastify.post("/whatsapp-account/sync-phone-numbers", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await syncPhoneNumbers(organizationId);
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "whatsapp_phone_numbers_data" } },
      create: { organizationId, key: "whatsapp_phone_numbers_data", value: JSON.stringify(data), dataType: "json" },
      update: { value: JSON.stringify(data) },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: { phoneNumber: string; pinCode: string } }>(
    "/whatsapp-account/register-phone",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const data = await registerPhoneNumber(organizationId, request.body.phoneNumber, request.body.pinCode);
      return reply.send({ data });
    }
  );

  fastify.put<{ Body: { pinCode: string } }>(
    "/whatsapp-account/two-step-verification",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const data = await setTwoStepVerification(organizationId, request.body.pinCode);
      return reply.send({ data });
    }
  );

  fastify.post("/whatsapp-account/enable-template-analytics", async (request, reply) => {
    const { organizationId } = request.auth;
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "template_analytics_status" } },
      create: { organizationId, key: "template_analytics_status", value: "enabled", dataType: "string" },
      update: { value: "enabled" },
    });
    return reply.send({ success: true });
  });

  fastify.post("/whatsapp-account/connect-webhook", async (request, reply) => {
    const { organizationId } = request.auth;
    // GAP-S65: subscribe to all 7 WABA webhook event types
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { whatsappBusinessAccountId: true, wabaAccessToken: true },
    });
    if (org?.whatsappBusinessAccountId && org.wabaAccessToken) {
      const callbackUrl = `${(process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/v1/webhooks/whatsapp`;
      const verifyToken = createHash("sha1").update(organizationId).digest("hex");
      await fetch(`${WA_GRAPH}/${org.whatsappBusinessAccountId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${org.wabaAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          override_callback_uri: callbackUrl,
          verify_token: verifyToken,
          subscribed_fields: WA_SUBSCRIBED_FIELDS,
        }),
      }).catch(() => undefined);
    }
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "webhook_verified_at" } },
      create: { organizationId, key: "webhook_verified_at", value: new Date().toISOString(), dataType: "string" },
      update: { value: new Date().toISOString() },
    });
    return reply.send({ success: true });
  });

  fastify.post("/whatsapp-account/disconnect-webhook", async (request, reply) => {
    const { organizationId } = request.auth;
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "webhook_verified_at" } },
      create: { organizationId, key: "webhook_verified_at", value: "", dataType: "string" },
      update: { value: "" },
    });
    return reply.send({ success: true });
  });

  // ── QR Code ───────────────────────────────────────────────────────────────
  // GAP-S39: generate wa.me/{phone} QR PNG for the org's WhatsApp number (300px, low error correction)
  fastify.get<{ Querystring: { message?: string; format?: "png" | "json" } }>(
    "/whatsapp-account/qr-code",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const setting = await fastify.prisma.vendorSetting.findFirst({
        where: { organizationId, key: "current_phone_number_number" },
        select: { value: true },
      });
      if (!setting?.value) {
        return reply.status(400).send({ error: { code: "NO_PHONE_NUMBER", message: "No WhatsApp phone number found; sync phone numbers first" } });
      }
      // Strip all non-numeric chars for wa.me URL (international format)
      const phone = setting.value.replace(/\D/g, "");
      const message = request.query.message ? `?text=${encodeURIComponent(request.query.message)}` : "";
      const waUrl = `https://wa.me/${phone}${message}`;
      const QRCode = await import("qrcode");
      if (request.query.format === "json") {
        const dataUrl = await QRCode.toDataURL(waUrl, { width: 300, errorCorrectionLevel: "L" });
        return reply.send({ data: { url: waUrl, qrDataUrl: dataUrl } });
      }
      const buffer = await QRCode.toBuffer(waUrl, { type: "png", width: 300, errorCorrectionLevel: "L" });
      reply.header("Content-Type", "image/png");
      reply.header("Content-Disposition", "inline; filename=whatsapp-qr.png");
      return reply.send(buffer);
    }
  );

  // GAP-S57: generate QR for an arbitrary URL (e.g. UPI address)
  fastify.get<{ Querystring: { url: string } }>(
    "/whatsapp-account/url-qr",
    { config: { public: true } },
    async (request, reply) => {
      const { url } = request.query;
      if (!url) return reply.status(400).send({ error: "url required" });
      const QRCode = await import("qrcode");
      const buffer = await QRCode.toBuffer(url, { type: "png", width: 300, errorCorrectionLevel: "L" });
      reply.header("Content-Type", "image/png");
      reply.header("Content-Disposition", "inline; filename=url-qr.png");
      return reply.send(buffer);
    }
  );

  fastify.post("/whatsapp-account/disconnect-account", async (request, reply) => {
    const { organizationId } = request.auth;
    const waKeys = ["whatsapp_access_token", "whatsapp_business_account_id", "current_phone_number_id", "webhook_verified_at"];
    await Promise.all(
      waKeys.map((key) =>
        fastify.prisma.vendorSetting.upsert({
          where: { organizationId_key: { organizationId, key } },
          create: { organizationId, key, value: "", dataType: "string" },
          update: { value: "" },
        })
      )
    );
    return reply.send({ success: true });
  });
};
