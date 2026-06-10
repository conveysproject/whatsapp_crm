import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { canAccess } from "../lib/permissions.js";
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

const WA_GRAPH = "https://graph.facebook.com/v25.0";

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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "administrative")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "administrative permission required" } });
    }
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
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "administrative")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "administrative permission required" } });
    }
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

  fastify.post<{
    Body: {
      code: string;
      wabaId?: string;
      phoneNumberId?: string;
      isSMB?: boolean;
      flow?: "onboarding" | "reconnect";
      redirectUri?: string;
    };
  }>("/whatsapp-account/connect", async (request, reply) => {
    const { organizationId } = request.auth;
    const { code, wabaId: bodyWabaId, phoneNumberId: bodyPhoneNumberId, isSMB = false, flow = "reconnect", redirectUri: bodyRedirectUri } = request.body;

    if (!code) {
      return reply.status(400).send({ error: { code: "MISSING_CODE", message: "code is required" } });
    }

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";
    if (!appId || !appSecret) {
      return reply.status(500).send({ error: { code: "APP_NOT_CONFIGURED", message: "Facebook app credentials not configured" } });
    }

    // Meta token exchange — redirect_uri must exactly match what was used in the OAuth dialog.
    const redirectUri = bodyRedirectUri ?? process.env["META_REDIRECT_URI"] ?? "";
    const tokenUrl = `${WA_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
    const tokenRes = await fetch(tokenUrl, { method: "GET" });
    if (!tokenRes.ok) {
      const rawErr = await tokenRes.text();
      fastify.log.error({ tokenUrl: tokenUrl.replace(appSecret, "***"), rawErr }, "Meta token exchange failed");
      let errMsg = "Failed to exchange code for token";
      try { errMsg = (JSON.parse(rawErr) as { error?: { message?: string } }).error?.message ?? errMsg; } catch { /* ignore */ }
      return reply.status(400).send({ error: { code: "TOKEN_EXCHANGE_FAILED", message: errMsg } });
    }
    const { access_token: accessToken } = await tokenRes.json() as { access_token: string };

    // Step 2: resolve WABA ID (from body or debug_token fallback)
    let wabaId = bodyWabaId ?? "";
    if (!wabaId) {
      try {
        const appToken = `${appId}|${appSecret}`;
        const r = await fetch(
          `${WA_GRAPH}/debug_token?input_token=${accessToken}&access_token=${encodeURIComponent(appToken)}`
        );
        if (r.ok) {
          const d = await r.json() as { data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } };
          const scope = d.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_messaging");
          wabaId = scope?.target_ids?.[0] ?? "";
        }
      } catch {
        // non-fatal — wabaId stays ""
      }
    }
    if (!wabaId) {
      return reply.status(400).send({ error: { code: "NO_WABA", message: "No WhatsApp Business Account found" } });
    }

    // Step 3: fetch WABA name
    let wabaName = "";
    try {
      const r = await fetch(`${WA_GRAPH}/${wabaId}?fields=name&access_token=${accessToken}`);
      if (r.ok) {
        const d = await r.json() as { name?: string };
        wabaName = d.name ?? "";
      }
    } catch {
      // non-fatal
    }

    // Step 4: resolve phone number
    let phoneNumberId = bodyPhoneNumberId ?? "";
    let displayPhoneNumber: string | null = null;
    if (phoneNumberId) {
      try {
        const r = await fetch(`${WA_GRAPH}/${phoneNumberId}?fields=display_phone_number&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json() as { display_phone_number?: string };
          displayPhoneNumber = d.display_phone_number ?? null;
        }
      } catch {
        // non-fatal
      }
    } else {
      try {
        const r = await fetch(`${WA_GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json() as { data?: { id: string; display_phone_number: string }[] };
          const phone = d.data?.[0];
          if (phone) {
            phoneNumberId = phone.id;
            displayPhoneNumber = phone.display_phone_number;
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Step 5: subscribe webhooks (fire-and-forget)
    const callbackUrl = `${(process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/v1/webhooks/whatsapp`;
    const verifyToken = createHash("sha1").update(organizationId).digest("hex");
    await fetch(`${WA_GRAPH}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ override_callback_uri: callbackUrl, verify_token: verifyToken, subscribed_fields: WA_SUBSCRIBED_FIELDS }),
    }).catch(() => undefined);

    // Step 6: coexistence mode (fire-and-forget)
    if (isSMB) {
      await fetch(`${WA_GRAPH}/${wabaId}/smb_app_data`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sync_type: "full" }),
      }).catch(() => undefined);
    }

    // Step 7: persist to Organization
    try {
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: {
          wabaAccessToken: accessToken,
          whatsappBusinessAccountId: wabaId,
          ...(phoneNumberId ? { phoneNumberId } : {}),
          ...(flow === "onboarding"
            ? { onboardingStep: phoneNumberId ? "done" : "provision_number" }
            : {}),
        },
      });
    } catch (err) {
      fastify.log.error({ err }, "Failed to persist Organization during /connect");
      return reply.status(500).send({ error: { code: "DB_ERROR", message: "Failed to save connection" } });
    }

    // Step 8: persist to VendorSettings
    const settingsToSave = [
      { key: "whatsapp_access_token", value: accessToken },
      { key: "whatsapp_business_account_id", value: wabaId },
      { key: "webhook_verified_at", value: new Date().toISOString() },
      { key: "facebook_app_id", value: appId },
      { key: "whatsapp_access_token_expired", value: "0" },
      ...(phoneNumberId ? [{ key: "current_phone_number_id", value: phoneNumberId }] : []),
      ...(displayPhoneNumber ? [{ key: "current_phone_number_number", value: displayPhoneNumber }] : []),
    ];
    try {
      await Promise.all(
        settingsToSave.map((s) =>
          fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: "string" },
            update: { value: s.value },
          })
        )
      );
    } catch (err) {
      fastify.log.error({ err }, "Failed to persist VendorSettings during /connect");
      return reply.status(500).send({ error: { code: "DB_ERROR", message: "Failed to save settings" } });
    }

    return reply.send({
      data: {
        wabaId,
        wabaName,
        phoneNumberId: phoneNumberId || null,
        displayPhoneNumber,
      },
    });
  });

  fastify.post("/whatsapp-account/disconnect-account", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "administrative")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "administrative permission required" } });
    }

    // Capture what's being cleared before wiping
    const [prevSettings, prevOrg] = await Promise.all([
      fastify.prisma.vendorSetting.findMany({
        where: { organizationId, key: { in: ["whatsapp_business_account_id", "current_phone_number_number", "current_phone_number_id", "webhook_verified_at"] } },
        select: { key: true, value: true },
      }),
      fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { whatsappBusinessAccountId: true, phoneNumberId: true },
      }),
    ]);

    const settingsMap = Object.fromEntries(prevSettings.map((s) => [s.key, s.value]));
    const clearedPhoneNumber = settingsMap["current_phone_number_number"] || null;
    const clearedPhoneNumberId = settingsMap["current_phone_number_id"] || prevOrg?.phoneNumberId || null;
    const clearedWabaId = settingsMap["whatsapp_business_account_id"] || prevOrg?.whatsappBusinessAccountId || null;
    const webhookWasConnected = Boolean(settingsMap["webhook_verified_at"]);

    const waKeys = [
      "whatsapp_access_token",
      "whatsapp_business_account_id",
      "current_phone_number_id",
      "current_phone_number_number",
      "webhook_verified_at",
    ];
    await Promise.all([
      ...waKeys.map((key) =>
        fastify.prisma.vendorSetting.upsert({
          where: { organizationId_key: { organizationId, key } },
          create: { organizationId, key, value: "", dataType: "string" },
          update: { value: "" },
        })
      ),
      fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { wabaAccessToken: null, whatsappBusinessAccountId: null, phoneNumberId: null },
      }),
    ]);

    return reply.send({
      data: {
        cleared: {
          phoneNumber: clearedPhoneNumber,
          phoneNumberId: clearedPhoneNumberId,
          wabaId: clearedWabaId,
          webhookDisconnected: webhookWasConnected,
        },
      },
    });
  });
};
