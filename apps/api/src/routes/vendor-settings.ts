import type { FastifyPluginAsync } from "fastify";

interface SettingEntry {
  key: string;
  value: string;
  dataType?: string;
}

export const vendorSettingsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/vendor-settings", async (request, reply) => {
    const { organizationId } = request.auth;
    const rows = await fastify.prisma.vendorSetting.findMany({
      where: { organizationId },
    });
    const data: Record<string, string> = {};
    for (const row of rows) {
      data[row.key] = row.value ?? "";
    }
    return reply.send({ data });
  });

  fastify.put<{ Body: { settings: SettingEntry[] } }>(
    "/vendor-settings",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { settings } = request.body;
      await Promise.all(
        settings.map((s) =>
          fastify.prisma.vendorSetting.upsert({
            where: { organizationId_key: { organizationId, key: s.key } },
            create: { organizationId, key: s.key, value: s.value, dataType: s.dataType ?? "string" },
            update: { value: s.value, dataType: s.dataType ?? "string" },
          })
        )
      );
      return reply.send({ success: true });
    }
  );

  fastify.put("/vendor-settings/sound-notification", async (request, reply) => {
    const { organizationId } = request.auth;
    const body = request.body as { disabled: boolean };
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "is_disabled_message_sound_notification" } },
      create: { organizationId, key: "is_disabled_message_sound_notification", value: String(body.disabled), dataType: "boolean" },
      update: { value: String(body.disabled) },
    });
    return reply.send({ success: true });
  });

  // ── Enable marketing messages (Meta template analytics opt-in) ───────────
  fastify.post("/vendor-settings/marketing-messages/enable", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org.wabaAccessToken) {
      return reply.status(400).send({ error: { code: "WA_NOT_CONNECTED", message: "WhatsApp account not connected" } });
    }

    // Call Meta Graph API to opt into marketing message analytics
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${org.phoneNumberId}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${org.wabaAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", enable_smart_delivery: true }),
      }
    );
    const json = await res.json() as Record<string, unknown>;

    const enabled = res.ok;
    await fastify.prisma.vendorSetting.upsert({
      where: { organizationId_key: { organizationId, key: "marketing_messages_enabled" } },
      create: { organizationId, key: "marketing_messages_enabled", value: String(enabled), dataType: "boolean" },
      update: { value: String(enabled) },
    });

    if (!res.ok) {
      return reply.status(400).send({ error: { code: "META_API_ERROR", message: (json["error"] as Record<string, string>)?.["message"] ?? "Meta API error" } });
    }
    return reply.send({ data: { enabled: true } });
  });

  // ── Marketing messages onboarding status ─────────────────────────────────
  fastify.get("/vendor-settings/marketing-messages/status", async (request, reply) => {
    const { organizationId } = request.auth;
    const setting = await fastify.prisma.vendorSetting.findUnique({
      where: { organizationId_key: { organizationId, key: "marketing_messages_enabled" } },
    });
    return reply.send({ data: { enabled: setting?.value === "true" } });
  });
};
