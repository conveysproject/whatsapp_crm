import type { FastifyPluginAsync } from "fastify";
import { createHash } from "crypto";
import { syncPhoneNumbers } from "../lib/whatsapp.js";

const WA_GRAPH = "https://graph.facebook.com/v25.0";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { code?: string; embedded?: boolean; phoneNumberId?: string; wabaId?: string; isSMB?: boolean };
  }>("/waba-callback", async (request, reply) => {
    const { code, embedded, phoneNumberId, wabaId, isSMB } = request.body;
    if (!code) return reply.status(400).send({ error: "code required" });

    const { organizationId } = request.auth;

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";

    // Step 1: Exchange code for access_token
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    // redirect_uri must always be sent and must exactly match the URI registered
    // in the Login Flow configuration (config_id). For popup-based Embedded Signup,
    // Meta still validates this against the Login Flow's configured redirect URI.
    if (process.env["META_REDIRECT_URI"]) {
      params.set("redirect_uri", process.env["META_REDIRECT_URI"]);
    }
    const metaUrl = `${WA_GRAPH}/oauth/access_token?${params.toString()}`;
    fastify.log.info({ embedded, appId }, "Meta token exchange attempt");
    const tokenRes = await fetch(metaUrl);
    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({})) as object;
      fastify.log.error({ metaError: errBody }, "Meta OAuth token exchange failed");
      return reply.status(502).send({ error: "meta_oauth_failed", detail: errBody });
    }
    const { access_token } = await tokenRes.json() as { access_token: string };

    const resolvedWabaId = wabaId ?? "";

    // Determine onboarding step
    const hasPhone = embedded && !!phoneNumberId;
    const onboardingStep = hasPhone ? "done" : "provision_number";

    // Persist token and WABA ID
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: {
        wabaAccessToken: access_token,
        onboardingStep,
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(resolvedWabaId ? { whatsappBusinessAccountId: resolvedWabaId } : {}),
      },
    });

    // GAP-S35: steps 2–5 run fire-and-forget (non-blocking for the response)
    void (async () => {
      try {
        // Step 2: sync phone numbers from WABA
        if (resolvedWabaId) {
          await syncPhoneNumbers(organizationId);
        }

        // Step 3: subscribe app to WABA webhooks (all 7 event types per GAP-S65)
        if (resolvedWabaId) {
          const callbackUrl = `${(process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/v1/webhooks/whatsapp`;
          const verifyToken = createHash("sha1").update(organizationId).digest("hex");
          await fetch(`${WA_GRAPH}/${resolvedWabaId}/subscribed_apps`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              override_callback_uri: callbackUrl,
              verify_token: verifyToken,
              subscribed_fields: ["messages", "message_template_quality_update", "message_template_status_update", "account_update", "history", "smb_app_state_sync", "smb_message_echoes"],
            }),
          });
          // Persist webhook verification marker
          await fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: "webhook_verified_at" } },
            create: { organizationId, key: "webhook_verified_at", value: new Date().toISOString(), dataType: "string" },
            update: { value: new Date().toISOString() },
          });
        }

        // Step 4: if SMB, post smb_app_data
        if (isSMB && resolvedWabaId) {
          await fetch(`${WA_GRAPH}/${resolvedWabaId}/smb_app_data`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sync_type: "full" }),
          });
        }

        // Step 5: save WABA credentials to vendor settings for health check
        const settingEntries = [
          { key: "whatsapp_access_token", value: access_token },
          { key: "whatsapp_access_token_expired", value: "0" },
          { key: "facebook_app_id", value: appId },
          ...(resolvedWabaId ? [{ key: "whatsapp_business_account_id", value: resolvedWabaId }] : []),
        ];
        await Promise.all(settingEntries.map((s) =>
          fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: "string" },
            update: { value: s.value },
          })
        ));
      } catch (err) {
        fastify.log.warn({ err }, "Embedded sign-up post-steps failed (non-critical)");
      }
    })();

    return reply.send({ success: true, phoneNumberId, wabaId: resolvedWabaId });
  });

  fastify.get("/status", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { wabaAccessToken: true, phoneNumberId: true, onboardingStep: true },
    });
    return reply.send({
      wabaConnected: !!org?.wabaAccessToken,
      numberProvisioned: !!org?.phoneNumberId,
      onboardingStep: org?.onboardingStep ?? "connect_waba",
    });
  });
};
