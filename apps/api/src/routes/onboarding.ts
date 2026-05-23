import type { FastifyPluginAsync } from "fastify";
import { syncPhoneNumbers } from "../lib/whatsapp.js";

const WA_GRAPH = "https://graph.facebook.com/v25.0";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: {
      code?: string;
      embedded?: boolean;
      phoneNumberId?: string;
      wabaId?: string;
      isSMB?: boolean;
      redirectUri?: string;
    };
  }>("/waba-callback", async (request, reply) => {
    const { code, phoneNumberId, wabaId, isSMB, redirectUri } = request.body;
    if (!code) return reply.status(400).send({ error: "code required" });

    const { organizationId } = request.auth;
    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";
    const resolvedRedirectUri = redirectUri ?? process.env["META_REDIRECT_URI"] ?? "";

    // Exchange code for access token
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    if (resolvedRedirectUri) params.set("redirect_uri", resolvedRedirectUri);

    const tokenRes = await fetch(`${WA_GRAPH}/oauth/access_token?${params.toString()}`);
    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({})) as object;
      fastify.log.error({ metaError: errBody }, "Meta OAuth token exchange failed");
      return reply.status(502).send({ error: "meta_oauth_failed", detail: errBody });
    }
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Resolve WABA ID — from body (postMessage) or debug_token granular_scopes fallback.
    // /me/businesses requires business_management permission which embedded signup doesn't grant.
    // debug_token returns the exact WABA IDs the user consented to via the config_id.
    let resolvedWabaId = wabaId ?? "";
    if (!resolvedWabaId) {
      try {
        const appToken = `${appId}|${appSecret}`;
        const r = await fetch(
          `${WA_GRAPH}/debug_token?input_token=${access_token}&access_token=${encodeURIComponent(appToken)}`
        );
        if (r.ok) {
          const d = await r.json() as {
            data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> };
          };
          const scope = d.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_messaging");
          resolvedWabaId = scope?.target_ids?.[0] ?? "";
          if (resolvedWabaId) fastify.log.info({ resolvedWabaId }, "WABA ID resolved from debug_token");
          else fastify.log.warn({ granular_scopes: d.data?.granular_scopes }, "debug_token returned no WABA ID");
        } else {
          fastify.log.warn({ status: r.status }, "debug_token call failed");
        }
      } catch (err) {
        fastify.log.warn({ err }, "Could not resolve WABA ID from debug_token");
      }
    }

    // Save token + IDs to org
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: {
        wabaAccessToken: access_token,
        onboardingStep: phoneNumberId ? "done" : "provision_number",
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(resolvedWabaId ? { whatsappBusinessAccountId: resolvedWabaId } : {}),
      },
    });

    // Post-steps: webhook subscription + vendor settings (fire-and-forget)
    void (async () => {
      try {
        if (resolvedWabaId) {
          await syncPhoneNumbers(organizationId);

          // Subscribe WABA to the app's webhook (configured in Meta App Dashboard).
          // No override_callback_uri — the app-level webhook handles all orgs; routing is by phone_number_id.
          await fetch(`${WA_GRAPH}/${resolvedWabaId}/subscribed_apps`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              subscribed_fields: ["messages", "message_template_quality_update", "message_template_status_update", "account_update"],
            }),
          });

          await fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: "webhook_verified_at" } },
            create: { organizationId, key: "webhook_verified_at", value: new Date().toISOString(), dataType: "string" },
            update: { value: new Date().toISOString() },
          });
        }

        if (isSMB && resolvedWabaId) {
          await fetch(`${WA_GRAPH}/${resolvedWabaId}/smb_app_data`, {
            method: "POST",
            headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sync_type: "full" }),
          });
        }

        await Promise.all(
          [
            { key: "whatsapp_access_token", value: access_token },
            { key: "whatsapp_access_token_expired", value: "0" },
            { key: "facebook_app_id", value: appId },
            ...(resolvedWabaId ? [{ key: "whatsapp_business_account_id", value: resolvedWabaId }] : []),
          ].map((s) =>
            fastify.prisma.vendorSetting.upsert({
              where: { organizationId_key: { organizationId, key: s.key } },
              create: { organizationId, key: s.key, value: s.value, dataType: "string" },
              update: { value: s.value },
            })
          )
        );
      } catch (err) {
        fastify.log.warn({ err }, "Post-steps failed (non-critical)");
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
      numberProvisioned: !!org?.phoneNumberId || org?.onboardingStep === "done",
      onboardingStep: org?.onboardingStep ?? "connect_waba",
    });
  });

  // Called when user clicks "Number is ready" on the provision-number page.
  // Re-runs syncPhoneNumbers (in case fire-and-forget missed it) and marks onboarding done.
  fastify.post("/sync-phone", async (request, reply) => {
    const { organizationId } = request.auth;
    const phones = await syncPhoneNumbers(organizationId);
    if (phones.length > 0) {
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { onboardingStep: "done" },
      });
      return reply.send({ phoneNumberId: phones[0]!.id, displayPhoneNumber: phones[0]!.displayPhoneNumber });
    }
    // No phone numbers from Meta API — mark done anyway so the user isn't stuck,
    // but return a flag so the frontend can inform them.
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingStep: "done" },
    });
    return reply.send({ phoneNumberId: null, displayPhoneNumber: null });
  });
};
