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

  // GAP-S35: Embedded WABA sign-up — 5-step OAuth flow
  fastify.post<{ Body: { code: string; isSMB?: boolean; syncType?: string } }>(
    "/whatsapp-account/embedded-signup",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { code, isSMB = false, syncType = "full" } = request.body;
      if (!code) {
        return reply.status(400).send({ error: { code: "MISSING_CODE", message: "code is required" } });
      }

      const appId = process.env["FACEBOOK_APP_ID"] ?? "";
      const appSecret = process.env["FACEBOOK_APP_SECRET"] ?? "";
      if (!appId || !appSecret) {
        return reply.status(500).send({ error: { code: "APP_NOT_CONFIGURED", message: "Facebook app credentials not configured" } });
      }

      // Step 1: exchange code for user access token
      const tokenRes = await fetch(
        `${WA_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
        { method: "GET" }
      );
      if (!tokenRes.ok) {
        const err = await tokenRes.json() as { error?: { message?: string } };
        return reply.status(400).send({ error: { code: "TOKEN_EXCHANGE_FAILED", message: err.error?.message ?? "Failed to exchange code for token" } });
      }
      const tokenData = await tokenRes.json() as { access_token: string };
      const accessToken = tokenData.access_token;

      // Step 2: get WABA and phone number info for this user
      const wabaRes = await fetch(
        `${WA_GRAPH}/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`,
        { method: "GET" }
      );
      if (!wabaRes.ok) {
        return reply.status(400).send({ error: { code: "WABA_FETCH_FAILED", message: "Failed to fetch WhatsApp Business Account" } });
      }
      const wabaData = await wabaRes.json() as { data?: { id: string; name: string }[] };
      const waba = wabaData.data?.[0];
      if (!waba) {
        return reply.status(400).send({ error: { code: "NO_WABA", message: "No WhatsApp Business Account found for this Facebook user" } });
      }
      const wabaId = waba.id;

      // Step 3: get phone numbers for this WABA
      const phonesRes = await fetch(
        `${WA_GRAPH}/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name`,
        { method: "GET" }
      );
      const phonesData = phonesRes.ok
        ? (await phonesRes.json() as { data?: { id: string; display_phone_number: string; verified_name: string }[] })
        : { data: [] };
      const phone = phonesData.data?.[0];

      // Subscribe webhooks with override callback and verify_token = sha1(organizationId)
      const callbackUrl = `${(process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/v1/webhooks/whatsapp`;
      const verifyToken = createHash("sha1").update(organizationId).digest("hex");
      await fetch(`${WA_GRAPH}/${wabaId}/subscribed_apps`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          override_callback_uri: callbackUrl,
          verify_token: verifyToken,
          subscribed_fields: WA_SUBSCRIBED_FIELDS,
        }),
      }).catch(() => undefined);

      // Step 4: if SMB mode, post smb_app_data
      if (isSMB) {
        await fetch(`${WA_GRAPH}/${wabaId}/smb_app_data`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ sync_type: syncType }),
        }).catch(() => undefined);
      }

      // Step 5: save all WABA settings
      const settingsToSave = [
        { key: "whatsapp_access_token", value: accessToken },
        { key: "whatsapp_business_account_id", value: wabaId },
        { key: "webhook_verified_at", value: new Date().toISOString() },
        ...(phone ? [
          { key: "current_phone_number_id", value: phone.id },
          { key: "current_phone_number_number", value: phone.display_phone_number },
        ] : []),
      ];
      await Promise.all(
        settingsToSave.map((s) =>
          fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: "string" },
            update: { value: s.value },
          })
        )
      );

      return reply.send({
        data: {
          wabaId,
          wabaName: waba.name,
          phoneNumber: phone?.display_phone_number ?? null,
          phoneNumberId: phone?.id ?? null,
        },
      });
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
