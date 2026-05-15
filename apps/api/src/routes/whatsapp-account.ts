import type { FastifyPluginAsync } from "fastify";
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
  fastify.get("/whatsapp-account/qr-code", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org.wabaAccessToken) {
      return reply.status(400).send({ error: { code: "WA_NOT_CONNECTED", message: "WhatsApp not connected" } });
    }
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${org.phoneNumberId}/whatsapp_business_profile_media`,
      { headers: { Authorization: `Bearer ${org.wabaAccessToken}` } }
    );
    const json = await res.json() as Record<string, unknown>;
    return reply.send({ data: json });
  });

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
