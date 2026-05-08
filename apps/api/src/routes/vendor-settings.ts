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
};
